import { test } from './fixtures'
import { expect } from '@playwright/test'
import fs from 'node:fs/promises'

// Fixed viewport coordinates (1440x900, top view, after Encuadrar) on two adjacent racks of the first aisle row; clicks alternate so each changes the selection.
const PICK_TARGETS: [number, number][] = [[345, 440], [377, 440]]

test('selección y cámara reutilizan la escena de 200 estanterías', async ({ page }) => {
  test.setTimeout(90000)
  await page.addInitScript(() => {
    const counters = { buffers: 0, textures: 0, draws: 0, calls: 0 }
    Object.assign(window, { sceneGpu: counters })
    for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const [method, counter] of [['bufferData', 'buffers'], ['createTexture', 'textures'], ['clear', 'draws']] as const) {
        const original = prototype[method] as (...args: unknown[]) => unknown
        Object.defineProperty(prototype, method, { configurable: true, value: function (this: unknown, ...args: unknown[]) { counters[counter]++; return original.apply(this, args) } })
      }
      for (const method of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'] as const) {
        const original = (prototype as unknown as Record<string, unknown>)[method] as ((...args: unknown[]) => unknown) | undefined
        if (!original) continue
        Object.defineProperty(prototype, method, { configurable: true, value: function (this: unknown, ...args: unknown[]) { counters.calls++; return original.apply(this, args) } })
      }
    }
  })
  await page.goto('/app')
  const doc = JSON.parse(await fs.readFile('fixtures/representative-warehouse.json', 'utf8'))
  await page.getByLabel('Abrir archivo de almacén').setInputFiles({ name: 'muestra.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) })
  await expect(page.locator('.element-row')).toHaveCount(200)
  // The list can be ready before the deferred 3D module has finished its initial render.
  await expect(page.locator('.canvas-panel canvas')).toBeVisible()
  const reset = () => page.evaluate(() => { Object.assign((window as unknown as { sceneGpu: object }).sceneGpu, { buffers: 0, textures: 0, draws: 0, calls: 0 }) })
  const counts = () => page.evaluate(() => ({ ...(window as unknown as { sceneGpu: { buffers: number; textures: number; draws: number; calls: number } }).sceneGpu }))
  await page.waitForTimeout(200); await reset()
  const start = Date.now()
  await page.locator('.element-row').nth(100).click()
  await expect(page.locator('.element-row').nth(100)).toHaveClass(/active/)
  await page.waitForTimeout(100)
  const selection = await counts(), selectionMs = Date.now() - start
  await reset()
  await page.getByRole('button', { name: 'Superior', exact: true }).click()
  await page.waitForTimeout(100)
  const camera = await counts()
  await fs.writeFile('artifacts/scene-performance.json', JSON.stringify({ racks: 200, selection, camera, selectionMs, note: 'Chromium / SwiftShader; latencia incluye automatización y espera de 100 ms.' }, null, 2))
  expect(selection.buffers).toBeLessThan(100)
  expect(selection.textures).toBeLessThan(20)
  expect(camera.buffers).toBe(0)
  // Newly visible labels upload their existing canvas texture lazily on first draw.
  await page.getByRole('button', { name: 'Isométrica', exact: true }).click()
  await page.getByRole('button', { name: 'Superior', exact: true }).click()
  await reset()
  await page.getByRole('button', { name: 'Isométrica', exact: true }).click()
  await page.getByRole('button', { name: 'Superior', exact: true }).click()
  const warmCamera = await counts()
  expect(warmCamera.buffers).toBe(0); expect(warmCamera.textures).toBe(0)
  await page.getByRole('button', { name: 'Isométrica', exact: true }).click()
  await page.getByLabel('Representación del almacén', { exact: true }).selectOption('detailed')
  await page.waitForTimeout(100); await reset()
  await page.locator('.element-row').nth(101).click()
  await page.waitForTimeout(100)
  const detailedSelection = await counts()
  expect(detailedSelection.textures).toBeLessThan(20)
  await reset()
  await page.waitForTimeout(600)
  const idle = await counts()
  expect(idle.draws).toBe(0)
  await page.screenshot({ path: 'artifacts/seleccion-escena-reutilizada.png' })
  // Draw calls per frame in isometric view after "Encuadrar", for each representation. `draws` counts clears (one per frame).
  const drawCalls = async (representation: 'blocks' | 'detailed') => {
    await page.getByLabel('Representación del almacén', { exact: true }).selectOption(representation)
    await page.getByRole('button', { name: 'Isométrica', exact: true }).click()
    await page.waitForTimeout(300); await reset()
    await page.getByRole('button', { name: 'Encuadrar', exact: true }).click()
    await page.waitForTimeout(300)
    const c = await counts()
    return { perFrame: Math.round(c.calls / Math.max(c.draws, 1)), total: c.calls, frames: c.draws }
  }
  const callsBlocks = await drawCalls('blocks'), callsDetailed = await drawCalls('detailed')
  const calls = { blocks: callsBlocks.perFrame, detailed: callsDetailed.perFrame, raw: { blocks: callsBlocks, detailed: callsDetailed } }
  expect(calls.blocks).toBeGreaterThan(0); expect(calls.detailed).toBeGreaterThan(0)
  // Task 0 baseline: 1272 calls per frame in blocks mode; batching must keep it at or below 60 %.
  expect(calls.blocks).toBeLessThanOrEqual(Math.floor(1272 * .6))
  // Click-picking latency: pointerdown until the selection renders (properties title changes; the virtualized list row may be unmounted) (median of 20).
  await page.getByLabel('Representación del almacén', { exact: true }).selectOption('blocks')
  await page.getByRole('button', { name: 'Superior', exact: true }).click()
  await page.getByRole('button', { name: 'Encuadrar', exact: true }).click()
  await page.waitForTimeout(300)
  const targets = PICK_TARGETS.map(([x, y]) => ({ x, y }))
  await page.evaluate(() => {
    const w = window as unknown as { pickStart: number; pickTimes: number[]; pickTitles: string[] }
    w.pickTimes = []; w.pickTitles = []; w.pickStart = 0
    window.addEventListener('pointerdown', () => { w.pickStart = performance.now() }, true)
    // The element list is virtualized, so the active row may not be mounted; the properties title (rack code) changes in the same render as `.active`.
    const title = () => document.querySelector('.property-title h3')?.textContent ?? ''
    let last = title()
    new MutationObserver(() => {
      const now = title()
      if (w.pickStart && now !== last) { w.pickTimes.push(performance.now() - w.pickStart); w.pickTitles.push(now); w.pickStart = 0 }
      last = now
    }).observe(document.querySelector('.properties-panel')!, { subtree: true, childList: true, characterData: true })
  })
  for (let i = 0; i < 20; i++) {
    const target = targets[i % targets.length]
    await page.mouse.click(target.x, target.y)
    await page.waitForFunction(n => (window as unknown as { pickTimes: number[] }).pickTimes.length >= n, i + 1, { timeout: 5000 })
    await page.waitForTimeout(80)
  }
  const pickTimes = await page.evaluate(() => (window as unknown as { pickTimes: number[] }).pickTimes)
  const pickTitles = await page.evaluate(() => (window as unknown as { pickTitles: string[] }).pickTitles)
  expect(pickTitles).toHaveLength(20)
  for (const title of pickTitles) expect(title).toMatch(/^[A-Z]\d$/)
  const sorted = [...pickTimes].sort((a, b) => a - b), pickMs = (sorted[9] + sorted[10]) / 2
  expect(pickMs).toBeGreaterThan(0)
  await fs.writeFile('artifacts/scene-performance.json', JSON.stringify({ racks: 200, selection, camera, warmCamera, detailedSelection, idle, selectionMs, calls, pickMs, pickTimes, pickTitles, note: 'Muestra sintética Chromium/SwiftShader; selección reconstruye únicamente elementos que cambian. Reposo medido durante 600 ms.' }, null, 2))
})

test('el filtro de inventario atenúa estanterías en lote', async ({ page }) => {
  const code = (i: number) => `${String.fromCharCode(65 + Math.floor(i / 10))}${i % 10}`
  const doc = {
    format: 'optiruta-warehouse', version: 1, id: 'batch-filter', name: 'Filtro en lote', widthMm: 150000, depthMm: 60000,
    racks: Array.from({ length: 200 }, (_, i) => ({ id: `rack-${i}`, code: code(i), alias: '', color: '#337b78', xMm: 1000 + i % 20 * 7000, yMm: 2000 + Math.floor(i / 20) * 5000, widthMm: 6000, depthMm: 1200, heightMm: 3000, rotation: 0, columns: 3, access: 'front', reverse: false, levels: [{ id: `level-${i}`, code: '01', elevationMm: 1000 }] })),
  }
  await page.goto('/app')
  await page.getByLabel('Abrir archivo de almacén').setInputFiles({ name: 'lote.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) })
  await expect(page.locator('.element-row')).toHaveCount(200)
  await page.getByRole('button', { name: 'Inventario', exact: true }).click()
  // One line per rack; "Grupo-3" matches racks 3, 23, …, 183 (10 racks).
  const csv = 'referencia;descripcion;ubicacion;cantidad\n' + Array.from({ length: 200 }, (_, i) => `SKU-${i};Grupo-${i % 20} pieza;${code(i)}0101;1`).join('\n')
  await page.getByLabel('Archivo de inventario').setInputFiles({ name: 'lote.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await page.getByRole('dialog').getByRole('button', { name: 'Importar inventario', exact: true }).click()
  await expect(page.locator('.opd-count strong')).toHaveText('200 de 200 líneas', { timeout: 30000 })
  const color = (id: string) => page.evaluate(id => (window as unknown as { __viewportDebug: { rackColor: (id: string) => string | null } }).__viewportDebug.rackColor(id), id)
  await expect.poll(() => color('rack-0')).not.toBeNull()
  const original = await color('rack-0'), matching = await color('rack-3')
  await page.getByRole('searchbox', { name: 'Buscar inventario' }).fill('Grupo-3 pieza')
  await expect(page.locator('.inventory-plan-summary')).toHaveText('Coincidencias en 10 estanterías')
  await expect.poll(() => color('rack-0')).not.toBe(original)
  expect(await color('rack-3')).toBe(matching)
  await page.getByRole('searchbox', { name: 'Buscar inventario' }).fill('')
  await expect(page.locator('.inventory-plan-summary')).toHaveCount(0)
  await expect.poll(() => color('rack-0')).toBe(original)
})
