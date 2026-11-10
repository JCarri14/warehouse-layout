import { test } from './fixtures'
import { expect } from '@playwright/test'
import fs from 'node:fs/promises'

test('selección y cámara reutilizan la escena de 200 estanterías', async ({ page }) => {
  test.setTimeout(90000)
  await page.addInitScript(() => {
    const counters = { buffers: 0, textures: 0, draws: 0 }
    Object.assign(window, { sceneGpu: counters })
    for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const [method, counter] of [['bufferData', 'buffers'], ['createTexture', 'textures'], ['clear', 'draws']] as const) {
        const original = prototype[method] as (...args: unknown[]) => unknown
        Object.defineProperty(prototype, method, { configurable: true, value: function (this: unknown, ...args: unknown[]) { counters[counter]++; return original.apply(this, args) } })
      }
    }
  })
  await page.goto('/app')
  const doc = JSON.parse(await fs.readFile('fixtures/representative-warehouse.json', 'utf8'))
  await page.getByLabel('Abrir archivo de almacén').setInputFiles({ name: 'muestra.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) })
  await expect(page.locator('.element-row')).toHaveCount(200)
  // The list can be ready before the deferred 3D module has finished its initial render.
  await expect(page.locator('.canvas-panel canvas')).toBeVisible()
  const reset = () => page.evaluate(() => { Object.assign((window as unknown as { sceneGpu: object }).sceneGpu, { buffers: 0, textures: 0, draws: 0 }) })
  const counts = () => page.evaluate(() => ({ ...(window as unknown as { sceneGpu: { buffers: number; textures: number; draws: number } }).sceneGpu }))
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
  await fs.writeFile('artifacts/scene-performance.json', JSON.stringify({ racks: 200, selection, camera, warmCamera, detailedSelection, idle, selectionMs, note: 'Muestra sintética Chromium/SwiftShader; selección reconstruye únicamente elementos que cambian. Reposo medido durante 600 ms.' }, null, 2))
})

