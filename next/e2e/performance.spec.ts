import { test } from './fixtures'
import { expect } from '@playwright/test'
import fs from 'node:fs/promises'
import * as xlsx from 'xlsx'
function bigInventoryXlsx() {
  const code = (i: number) => `${String.fromCharCode(65 + Math.floor(i / 10))}${i % 10}`
  const sheet = xlsx.utils.aoa_to_sheet([['referencia', 'descripcion', 'ubicacion', 'cantidad'], ...Array.from({ length: 50000 }, (_, i) => [`SKU-${i}`, `Grupo-${i % 4} pieza`, `${code(i % 200)}0101`, 1])])
  const book = xlsx.utils.book_new(); xlsx.utils.book_append_sheet(book, sheet, 'Inventario')
  return Buffer.from(xlsx.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
}
const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
test('muestra sintética de 200 estanterías', async ({ page, browserName }) => {
  test.setTimeout(60000)
  const doc = {
    format: 'optiruta-warehouse', version: 1, id: 'performance', name: 'Muestra de 200 estanterías', widthMm: 150000, depthMm: 60000,
    racks: Array.from({ length: 200 }, (_, i) => ({
      id: `rack-${i}`, code: `${String.fromCharCode(65 + Math.floor(i / 10))}${i % 10}`, alias: '', color: '#337b78',
      xMm: 1000 + i % 20 * 7000, yMm: 2000 + Math.floor(i / 20) * 5000,
      widthMm: 6000, depthMm: 1200, heightMm: 3000, rotation: 0, columns: 3, access: 'front', reverse: false,
      contents: ['shelves', 'pallets', 'bins', 'cartons'][i % 4],
      levels: [0, 1400, 2800].map((elevationMm, j) => ({ id: `level-${i}-${j}`, code: `0${j}`, elevationMm })),
    })),
  }
  await fs.mkdir('fixtures', { recursive: true }); await fs.writeFile('fixtures/representative-warehouse.json', JSON.stringify(doc, null, 2))
  await page.addInitScript(() => {
    const w = window as unknown as { longTasks: number[] }
    w.longTasks = []
    try { new PerformanceObserver(list => { for (const e of list.getEntries()) w.longTasks.push(e.duration) }).observe({ type: 'longtask', buffered: true }) } catch { /* longtask unsupported */ }
  })
  let workersSpawned = 0
  page.on('worker', () => { workersSpawned++ })
  await page.goto('/app')
  const start = Date.now()
  await page.getByLabel('Abrir archivo de almacén').setInputFiles({ name: 'muestra.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) })
  await expect(page.locator('.element-row')).toHaveCount(200)
  await page.getByRole('button', { name: 'Superior', exact: true }).click()
  await page.getByRole('button', { name: 'Encuadrar', exact: true }).click()
  const openAndChangeViewMs = Date.now() - start
  const samples = await page.evaluate(async () => {
    const durations: number[] = []; let previous = performance.now()
    for (let i = 0; i < 30; i++) { const now = await new Promise<number>(resolve => requestAnimationFrame(resolve)); durations.push(now - previous); previous = now }
    return durations.slice(1)
  })
  await page.screenshot({ path: 'artifacts/editor-200.png' })
  await page.getByRole('button', { name: 'Isométrica', exact: true }).click()
  const detailStart = Date.now()
  await page.getByLabel('Representación del almacén', { exact: true }).selectOption('detailed')
  await page.screenshot({ path: 'artifacts/editor-detallado-200.png' })
  const detailedViewMs = Date.now() - detailStart
  await page.getByLabel('Representación del almacén', { exact: true }).selectOption('blocks')
  await page.getByLabel('Representación del almacén', { exact: true }).selectOption('detailed')
  // Import of a synthetic 50,000 row x 4 column XLSX through the operations panel. The file is given by path:
  // Playwright's base64 buffer transfer would otherwise add a ~1.4 s task of its own that the app does not cause.
  const xlsxBuffer = bigInventoryXlsx(), xlsxPath = 'artifacts/inventario-50000.xlsx'
  await fs.writeFile(xlsxPath, xlsxBuffer)
  await page.getByRole('button', { name: 'Inventario', exact: true }).click()
  await page.waitForTimeout(3000) // let the detailed 3D view settle so its own tasks are not counted as import work
  await page.evaluate(() => { (window as unknown as { longTasks: number[] }).longTasks.length = 0 })
  const importStart = Date.now()
  await page.getByLabel('Archivo de inventario').setInputFiles(xlsxPath)
  await page.getByRole('dialog').getByRole('button', { name: 'Importar inventario', exact: true }).waitFor()
  const readMs = Date.now() - importStart
  expect(workersSpawned).toBeGreaterThan(0) // the workbook was read in a worker, not through the main-thread fallback
  const readTasks = await page.evaluate(() => (window as unknown as { longTasks: number[] }).longTasks.splice(0))
  const readLongestTaskMs = Math.max(0, ...readTasks)
  await page.getByRole('dialog').getByRole('button', { name: 'Importar inventario', exact: true }).click()
  await expect(page.locator('.opd-count strong')).toHaveText('50000 de 50000 líneas', { timeout: 60000 })
  const importMs = Date.now() - importStart
  const longTasks = await page.evaluate(() => (window as unknown as { longTasks: number[] }).longTasks)
  const longestTaskMs = Math.max(0, ...longTasks)
  expect(importMs).toBeGreaterThan(0); expect(longestTaskMs).toBeGreaterThan(0)
  // Reading the workbook runs in a worker: the main thread only receives the tables and renders the review dialog.
  // Baseline before the worker was a single 1303 ms task. The remaining tasks are previewImport (~100 ms), the structured
  // clone of 50,000 rows and React; committing the import (ids, inventory index) is measured separately above.
  // Alone it measures ~300-400 ms; the generous bound absorbs CPU contention from the parallel e2e workers (797 ms seen).
  expect(readLongestTaskMs).toBeLessThan(1000)
  await fs.writeFile('artifacts/performance.json', JSON.stringify({ browserName, importMs, longestTaskMs, readMs, readLongestTaskMs, readTaskCount: readTasks.length, longTaskCount: longTasks.length, importRows: 50000, xlsxBytes: xlsxBuffer.length, userAgent: await page.evaluate(() => navigator.userAgent), platform: process.platform, hardwareConcurrency: await page.evaluate(() => navigator.hardwareConcurrency), renderer: 'Chromium headless / SwiftShader (software)', viewport: '1440x900', racks: 200, openAndChangeViewMs, meanIdleFrameIntervalMs: samples.reduce((a, b) => a + b, 0) / samples.length, note: 'Muestra sintética; no sustituye validación en portátiles reales. La aplicación renderiza por eventos, no por este muestreo requestAnimationFrame.' }, null, 2))
  expect(detailedViewMs).toBeLessThan(30000)
  await expect(page.getByRole('alert')).toHaveCount(0)
})


test('el último archivo gana al elegir otro mientras se lee el Excel grande', async ({ page }) => {
  test.setTimeout(60000)
  const xlsxBuffer = bigInventoryXlsx()
  const csv = await fs.readFile('../ejemplo-ERP.csv')
  await page.goto('/app')
  await page.getByRole('button', { name: 'Añadir estantería', exact: true }).first().click()
  await page.getByRole('button', { name: 'Inventario', exact: true }).click()
  const input = page.getByLabel('Archivo de inventario')
  await input.setInputFiles({ name: 'inventario-50000.xlsx', mimeType: xlsxMime, buffer: xlsxBuffer })
  await input.setInputFiles({ name: 'ejemplo-ERP.csv', mimeType: 'text/csv', buffer: csv })
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.opi-file')).toHaveText('ejemplo-ERP.csv')
  await page.waitForTimeout(3000)
  await expect(dialog.locator('.opi-file')).toHaveText('ejemplo-ERP.csv')
  await expect(page.getByRole('alert')).toHaveCount(0)
})
