import { changeLanguage } from './helpers'
import { test } from './fixtures'
import { expect } from '@playwright/test'
import { warehouseAction } from './helpers'
import fs from 'node:fs/promises'

test('cambia idioma sin alterar datos ni propiedades y conserva la preferencia', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/app')
  await page.getByLabel('Nombre del almacén', { exact: true }).fill('Almacén de Joan')
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await changeLanguage(page, 'en')
  await expect(page.getByRole('button', { name: 'Design', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Warehouse name', { exact: true })).toHaveValue('Almacén de Joan')
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await page.getByLabel('Grid size', { exact: true }).fill('0.5')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Work orders', exact: true }).click()
  await page.getByRole('button', { name: 'Add line', exact: true }).click()
  await page.getByLabel('Description line 1', { exact: true }).fill('Tornillo español')
  await page.getByLabel('Quantity line 1', { exact: true }).fill('2.5')
  await changeLanguage(page, 'es')
  await expect(page.getByLabel('Descripción línea 1', { exact: true })).toHaveValue('Tornillo español')
  await expect(page.getByLabel('Cantidad línea 1', { exact: true })).toHaveValue('2.5')
  await changeLanguage(page, 'en')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('optiruta.language'))).toBe('en')
  await expect.poll(() => page.evaluate(() => !!localStorage.getItem('optiruta.workspace.recovery.v1'))).toBe(true)
  page.on('dialog', dialog => dialog.accept()); await page.reload()
  await expect(page.getByRole('dialog')).toContainText('Recover')
  await page.getByRole('button', { name: 'Recover session', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Work orders', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Description line 1', { exact: true })).toHaveValue('Tornillo español')
  expect(errors).toEqual([])
})

test('ajuste inicial sigue la cuadrícula guardada y la vista detallada es una preferencia', async ({ page }) => {
  await page.goto('/app')
  await expect(page.getByLabel('Paso de cuadrícula')).toHaveValue('-1')
  await expect(page.getByLabel('Tamaño de cuadrícula', { exact: true })).toHaveValue('1')
  await warehouseAction(page, 'Abrir ejemplo')
  await page.getByLabel('Representación del almacén', { exact: true }).selectOption('detailed')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('optiruta.representation'))).toBe('detailed')
  await page.screenshot({ path: 'artifacts/almacen-detallado-1440.png' })
  await expect(page.locator('.status-meta')).toContainText('Sin cambios pendientes')
})

test('completa una recogida y genera un informe en inglés conservando los datos españoles', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/app')
  await warehouseAction(page, 'Abrir ejemplo')
  await changeLanguage(page, 'en')
  await page.getByRole('button', { name: 'Work orders', exact: true }).click()
  await page.getByLabel('Work order file', { exact: true }).setInputFiles({ name: 'OT-Joan.csv', mimeType: 'text/csv', buffer: Buffer.from('reference;description;location;quantity\nREF-1;Tornillo español;A10101;2.5\n') })
  await page.getByRole('dialog').getByRole('button', { name: 'Import work order', exact: true }).click()
  await page.getByRole('button', { name: 'Routes', exact: true }).click()
  await page.getByRole('button', { name: 'Calculate route', exact: true }).click()
  await expect(page.locator('.route-results')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('.route-results')).toContainText('Tornillo español')
  await page.getByText('How to interpret the route', { exact: true }).click()
  await expect(page.locator('.route-warnings')).toContainText('mesh')
  await page.setViewportSize({ width: 1100, height: 740 })
  await page.screenshot({ path: 'artifacts/recorrido-ingles-1100.png' })
  await page.getByRole('button', { name: 'Reports', exact: true }).click()
  await page.getByLabel('Report contents', { exact: true }).selectOption('route')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
  const pdf = await fs.readFile((await (await download).path())!)
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
  expect(pdf.toString('latin1')).toContain('Picking route')
  expect(errors).toEqual([])
})

