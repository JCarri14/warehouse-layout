import { test } from './fixtures'
import { expect } from '@playwright/test'

test('Diseñar atenúa el contexto, conserva el contenido de la zona y restaura al deseleccionar', async ({ page }) => {
  await page.goto('/app')
  const rack = (id: string, code: string, xMm: number, yMm: number) => ({ id, code, xMm, yMm, alias: '', color: '#337b78', widthMm: 6000, depthMm: 3000, heightMm: 3000, columns: 3, rotation: 0, access: 'front', reverse: false, levels: [] })
  const doc = { format: 'optiruta-warehouse', version: 4, id: 'design-focus', name: 'Enfoque de diseño', widthMm: 32000, depthMm: 34000, gridSizeMm: 1000, locationTemplate: '{S}{N}{C}', racks: [rack('r1', 'R1', 2000, 2000), rack('r2', 'R2', 20000, 20000)], zones: [{ kind: 'zone', id: 'zone', code: 'Z1', name: 'Área de trabajo', color: '#c3a156', xMm: 1000, yMm: 1000, widthMm: 10000, depthMm: 8000, rotation: 0 }], fixtures: [{ kind: 'table', id: 'table', code: 'M1', name: 'Mesa de apoyo', color: '#896e4a', xMm: 7000, yMm: 6000, widthMm: 2000, depthMm: 1000, heightMm: 1000, rotation: 0 }] }
  await page.getByLabel('Abrir archivo de almacén').setInputFiles({ name: 'enfoque.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) })
  await expect(page.locator('.element-row')).toHaveCount(4)
  await page.getByRole('button', { name: 'Superior', exact: true }).click()
  const canvas = page.locator('.canvas-panel canvas'), bounds = (await canvas.boundingBox())!
  const half = Math.max(34 / 2 * 1.15 + 2, (32 / 2 * 1.15 + 2) / (bounds.width / bounds.height)), scale = bounds.height / (2 * half)
  const patch = (x: number, y: number) => page.screenshot({ clip: { x: Math.round(bounds.x + bounds.width / 2 + (x - 16) * scale) - 2, y: Math.round(bounds.y + bounds.height / 2 + (y - 17) * scale) - 2, width: 5, height: 5 } })
  const beforeR1 = await patch(2.6, 4.5), beforeR2 = await patch(20.6, 22.5), beforeTable = await patch(7.3, 6.8), floor = await patch(15.3, 15.3)
  await page.locator('.element-row').filter({ hasText: 'R1' }).click()
  expect((await patch(20.6, 22.5)).equals(beforeR2)).toBe(false)
  expect((await patch(15.3, 15.3)).equals(floor)).toBe(true)
  await page.screenshot({ path: 'artifacts/diseno-enfoque-estanteria.png' })
  await page.locator('.warehouse-row').click()
  expect((await patch(20.6, 22.5)).equals(beforeR2)).toBe(true)
  await page.locator('.element-row[data-kind="zone"]').click()
  expect((await patch(2.6, 4.5)).equals(beforeR1)).toBe(true)
  expect((await patch(7.3, 6.8)).equals(beforeTable)).toBe(true)
  expect((await patch(20.6, 22.5)).equals(beforeR2)).toBe(false)
  await page.screenshot({ path: 'artifacts/diseno-enfoque-zona.png' })
  await page.getByRole('button', { name: 'Isométrica', exact: true }).click()
  await page.getByLabel('Representación del almacén', { exact: true }).selectOption('detailed')
  await expect(canvas).toBeVisible()
  await page.screenshot({ path: 'artifacts/diseno-enfoque-zona-detallada.png' })
  await page.getByRole('button', { name: 'Superior', exact: true }).click()
  await page.locator('.warehouse-row').click()
  expect((await patch(2.6, 4.5)).equals(beforeR1)).toBe(true)
  expect((await patch(20.6, 22.5)).equals(beforeR2)).toBe(true)
})

