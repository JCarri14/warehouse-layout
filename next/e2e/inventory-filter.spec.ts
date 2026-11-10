import { test } from './fixtures'
import { expect } from '@playwright/test'
import fs from 'node:fs/promises'

test('filtro de 50.000 artículos: plano completo y actualización sin reconstruir geometría', async ({ page }) => {
  test.setTimeout(180000)
  await page.addInitScript(() => {
    const counters = { buffers: 0, textures: 0, draws: 0 }
    Object.assign(window, { inventoryGpu: counters })
    const recovery = { inventoryWrites: 0, metadataBytes: 0, metadataWriteMs: [] as number[] }
    Object.assign(window, { recoveryMetrics: recovery })
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if (this.name === 'inventories') recovery.inventoryWrites++
      return put.apply(this, args)
    }
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      const start = performance.now()
      setItem.call(this, key, value)
      if (key === 'optiruta.workspace.recovery.v1') { recovery.metadataBytes = new TextEncoder().encode(value).length; recovery.metadataWriteMs.push(performance.now() - start) }
    }
    for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const [method, counter] of [['bufferData', 'buffers'], ['createTexture', 'textures'], ['clear', 'draws']] as const) {
        const original = prototype[method] as (...args: unknown[]) => unknown
        Object.defineProperty(prototype, method, { configurable: true, value: function (this: unknown, ...args: unknown[]) { counters[counter]++; return original.apply(this, args) } })
      }
    }
  })
  const code = (i: number) => `${String.fromCharCode(65 + Math.floor(i / 10))}${i % 10}`
  const doc = {
    format: 'optiruta-warehouse', version: 1, id: 'inventory-performance', name: 'Inventario grande', widthMm: 150000, depthMm: 60000,
    racks: Array.from({ length: 200 }, (_, i) => ({ id: `rack-${i}`, code: code(i), alias: '', color: '#337b78', xMm: 1000 + i % 20 * 7000, yMm: 2000 + Math.floor(i / 20) * 5000, widthMm: 6000, depthMm: 1200, heightMm: 3000, rotation: 0, columns: 3, access: 'front', reverse: false, levels: [{ id: `level-${i}`, code: '01', elevationMm: 1000 }] })),
  }
  await page.goto('/app')
  await page.getByLabel('Abrir archivo de almacén').setInputFiles({ name: 'grande.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) })
  await page.getByRole('button', { name: 'Inventario', exact: true }).click()
  const csv = 'referencia;descripcion;ubicacion;cantidad\n' + Array.from({ length: 49999 }, (_, i) => `SKU-${i};Grupo-${i % 4} pieza;${code(i % 200)}0101;1`).join('\n') + '\nSIN-PLANO;Externo;Z90101;1'
  await page.getByLabel('Archivo de inventario').setInputFiles({ name: 'grande.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await page.getByRole('dialog').getByRole('button', { name: 'Importar inventario', exact: true }).click()
  await expect(page.locator('.opd-count strong')).toHaveText('50000 de 50000 líneas', { timeout: 30000 })
  await page.waitForTimeout(300)
  const reset = () => page.evaluate(() => { const c = (window as unknown as { inventoryGpu: Record<string, number> }).inventoryGpu; for (const key of Object.keys(c)) c[key] = 0 })
  const counts = () => page.evaluate(() => ({ ...(window as unknown as { inventoryGpu: Record<string, number> }).inventoryGpu }))
  const search = page.getByRole('searchbox', { name: 'Buscar inventario' })
  await reset()
  const started = Date.now()
  await search.pressSequentially('Grupo-0', { delay: 15 })
  await expect(page.locator('.inventory-plan-summary')).toHaveText('Coincidencias en 50 estanterías')
  await expect(page.locator('.opd-count strong')).toHaveText('12500 de 50000 líneas')
  const typingAndResultMs = Date.now() - started
  const changedSet = await counts()
  expect(changedSet.buffers).toBe(0); expect(changedSet.textures).toBe(0); expect(changedSet.draws).toBeGreaterThan(0)
  await reset()
  await search.fill('Grupo-0 pieza')
  await expect(page.locator('.opd-table')).toHaveAttribute('aria-busy', 'false')
  const sameSet = await counts()
  expect(sameSet).toEqual({ buffers: 0, textures: 0, draws: 0 })
  await page.getByRole('button', { name: 'Página siguiente', exact: true }).click()
  await expect(page.locator('.inventory-plan-summary')).toHaveText('Coincidencias en 50 estanterías')
  await page.screenshot({ path: 'artifacts/inventario-filtrado-grande.png' })
  await search.fill('no-existe-ninguno')
  await expect(page.locator('.inventory-plan-summary')).toHaveText('Sin coincidencias en el inventario.')
  await search.fill('Externo')
  await expect(page.locator('.inventory-plan-summary')).toHaveText('Hay resultados, pero sus ubicaciones no están representadas.')
  await search.fill('')
  await expect(page.locator('.inventory-plan-summary')).toHaveCount(0)
  await page.getByLabel('Estado de ubicaciones').selectOption('unplaced')
  await expect(page.locator('.opd-count strong')).toHaveText('1 de 50000 líneas')
  await expect(page.locator('.inventory-plan-summary')).toHaveText('Hay resultados, pero sus ubicaciones no están representadas.')
  await page.getByLabel('Estado de ubicaciones').selectOption('all')
  await expect(page.locator('.inventory-plan-summary')).toHaveCount(0)
  await expect(page.locator('.recovery-status')).toContainText('Copia local actualizada')
  const savedInventoryRef = await page.evaluate(() => JSON.parse(localStorage.getItem('optiruta.workspace.recovery.v1')!).inventoryRef)
  expect(savedInventoryRef).toBeTruthy()
  await page.getByRole('button', { name: 'Órdenes de trabajo', exact: true }).click()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('optiruta.workspace.recovery.v1')!).session.mode)).toBe('order')
  await page.getByRole('button', { name: 'Inventario', exact: true }).click()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('optiruta.workspace.recovery.v1')!).session.mode)).toBe('inventory')
  const recovery = await page.evaluate(() => ({ ...(window as unknown as { recoveryMetrics: { inventoryWrites: number; metadataBytes: number; metadataWriteMs: number[] } }).recoveryMetrics }))
  expect(recovery.inventoryWrites).toBe(1)
  expect(recovery.metadataBytes).toBeLessThan(200000)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('optiruta.workspace.recovery.v1')!).inventoryRef)).toBe(savedInventoryRef)
  await fs.writeFile('artifacts/recovery-performance.json', JSON.stringify({ rows: 50000, ...recovery, note: 'Inventario guardado una vez en IndexedDB; cambios de sección solo actualizan el manifiesto.' }, null, 2))
  page.on('dialog', dialog => dialog.accept())
  await page.reload()
  await page.getByRole('button', { name: 'Recuperar sesión', exact: true }).click()
  await expect(page.locator('.opd-count strong')).toHaveText('50000 de 50000 líneas')
  await expect(page.locator('.recovery-status')).toContainText('Copia local actualizada')
  // Hydration seeds the inventory cache; accepting recovery does not write the 50k rows again.
  expect(await page.evaluate(() => (window as unknown as { recoveryMetrics: { inventoryWrites: number } }).recoveryMetrics.inventoryWrites)).toBe(0)
  await fs.writeFile('artifacts/inventory-filter-performance.json', JSON.stringify({ rows: 50000, racks: 200, typingAndResultMs, changedSet, sameSet, note: 'Chromium headless / SwiftShader; muestra sintética, incluye escritura y espera de 180 ms.' }, null, 2))
})

