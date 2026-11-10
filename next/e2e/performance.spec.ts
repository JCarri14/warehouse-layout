import { test } from './fixtures'
import { expect } from '@playwright/test'
import fs from 'node:fs/promises'
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
  await fs.writeFile('artifacts/performance.json', JSON.stringify({ browserName, userAgent: await page.evaluate(() => navigator.userAgent), platform: process.platform, hardwareConcurrency: await page.evaluate(() => navigator.hardwareConcurrency), renderer: 'Chromium headless / SwiftShader (software)', viewport: '1440x900', racks: 200, openAndChangeViewMs, meanIdleFrameIntervalMs: samples.reduce((a, b) => a + b, 0) / samples.length, note: 'Muestra sintética; no sustituye validación en portátiles reales. La aplicación renderiza por eventos, no por este muestreo requestAnimationFrame.' }, null, 2))
  expect(detailedViewMs).toBeLessThan(30000)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

