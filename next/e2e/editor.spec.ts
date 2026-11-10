import { warehouseAction } from './helpers'
import { test } from './fixtures'
import { expect } from '@playwright/test'
import fs from 'node:fs/promises'

test('crear, editar, descargar y reabrir sin transmitir datos', async ({ page }) => {
  const errors: string[] = [], external: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:5173') && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) external.push(r.url()) })
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Un espacio por definir' })).toBeVisible()
  await page.getByLabel('Nombre del almacén').fill('Almacén de prueba')
  await page.getByLabel('Ancho', { exact: true }).fill('40')
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await page.getByRole('button', { name: 'Añadir estantería', exact: true }).first().click()
  await page.getByLabel('Ancho', { exact: true }).fill('6.0')
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Aplicar', exact: true })).toBeDisabled()
  await page.getByLabel('Nombre opcional').fill('Repuestos')
  await page.getByLabel('Ancho', { exact: true }).fill('5,5')
  await page.getByLabel('Altura real (opcional)').fill('3,2')
  await page.getByRole('tab', { name: 'Niveles', exact: true }).click()
  await page.getByLabel('Cota nivel 2', { exact: true }).fill('1,5')
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click()
  const event = page.waitForEvent('download')
  await warehouseAction(page, 'Guardar almacén')
  const download = await event
  const path = (await download.path())!
  const exported = JSON.parse(await fs.readFile(path, 'utf8'))
  expect(exported.name).toBe('Almacén de prueba')
  expect(exported.widthMm).toBe(40000)
  expect(exported.racks[0]).toMatchObject({ widthMm: 5500, heightMm: 3200, alias: 'Repuestos' })
  expect(exported.racks[0].levels[1].elevationMm).toBe(1500)
  await page.getByRole('button', { name: 'Superior', exact: true }).click()
  const event2 = page.waitForEvent('download')
  await warehouseAction(page, 'Guardar almacén')
  expect(JSON.parse(await fs.readFile((await (await event2).path())!, 'utf8'))).toEqual(exported)
  await warehouseAction(page, 'Nuevo almacén')
  await page.getByLabel('Abrir archivo de almacén').setInputFiles(path)
  await expect(page.locator('.document-title')).toContainText('Almacén de prueba')
  await page.getByRole('button', { name: /A0 Repuestos/ }).click()
  await expect(page.getByLabel('Ancho', { exact: true })).toHaveValue('5,5')
  await page.getByRole('tab', { name: 'Niveles', exact: true }).click()
  await expect(page.getByLabel('Cota nivel 2', { exact: true })).toHaveValue('1,5')
  expect(errors).toEqual([]); expect(external).toEqual([])
})

test('protege los cambios y mantiene el documento ante colisiones y archivos inválidos', async ({ page }) => {
  await page.goto('/app')
  await page.getByRole('button', { name: 'Añadir estantería', exact: true }).first().click()
  await page.getByLabel('Ancho', { exact: true }).fill('33')
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('fuera')
  await page.getByRole('button', { name: /Plano general/ }).click()
  await expect(page.getByRole('dialog')).toContainText('Propiedades sin aplicar')
  await page.getByRole('button', { name: 'Volver a editar' }).click()
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.getByRole('button', { name: 'Añadir estantería', exact: true }).first().click()
  await page.getByLabel('Coordenada X').fill('1')
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('solapan')
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.getByLabel('Abrir archivo de almacén').setInputFiles({ name: 'mal.json', mimeType: 'application/json', buffer: Buffer.from('{') })
  await expect(page.getByRole('alert')).toContainText('JSON')
  await expect(page.getByLabel('Código', { exact: true })).toHaveValue('A1')
  await warehouseAction(page, 'Nuevo almacén')
  await expect(page.getByRole('dialog')).toContainText('¿Guardar el almacén actual?')
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(page.getByLabel('Código', { exact: true })).toHaveValue('A1')
})

test('ejemplo y vistas en monitor y portátil', async ({ page }) => {
  await page.goto('/app')
  await warehouseAction(page, 'Abrir ejemplo')
  await expect(page.locator('.element-row')).toHaveCount(15)
  await expect(page.locator('.viewport canvas')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.screenshot({ path: 'artifacts/editor-isometrico-1440.png' })
  await page.setViewportSize({ width: 1100, height: 740 })
  await page.getByRole('complementary', { name: 'Elementos del almacén' }).getByRole('button', { name: /A1/ }).click()
  await page.screenshot({ path: 'artifacts/editor-portatil-1100.png' })
  await page.getByRole('button', { name: 'Superior', exact: true }).click()
  await page.screenshot({ path: 'artifacts/editor-superior-1100.png' })
  const canvas = (await page.locator('.viewport canvas').boundingBox())!
  const half = Math.max(34 / 2 * 1.15 + 2, (32 / 2 * 1.15 + 2) / (canvas.width / canvas.height))
  const pixelsPerMetre = canvas.height / (2 * half)
  await page.mouse.click(canvas.x + canvas.width / 2 + (5.5 - 16) * pixelsPerMetre, canvas.y + canvas.height / 2 + (4.1 - 17) * pixelsPerMetre)
  await expect(page.getByLabel('Código', { exact: true })).toHaveValue('A1')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('conserva cambios realizados mientras se lee un archivo', async ({ page }) => {
  await page.goto('/app')
  await page.evaluate(() => {
    const read = File.prototype.text
    File.prototype.text = async function () { await new Promise(resolve => setTimeout(resolve, 1200)); return read.call(this) }
  })
  const doc = { format: 'optiruta-warehouse', version: 1, id: 'open-race', name: 'Otro almacén', widthMm: 10000, depthMm: 10000, racks: [] }
  await page.getByLabel('Abrir archivo de almacén').setInputFiles({ name: 'otro.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) })
  await page.getByLabel('Nombre del almacén').fill('Mi trabajo nuevo')
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('¿Guardar el almacén actual?')
  await page.keyboard.press('Escape')
  await expect(page.locator('.document-title')).toContainText('Mi trabajo nuevo')
})

test('permite crear y seleccionar varias estanterías en pantalla estrecha', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 800 })
  await page.goto('/app')
  await page.getByRole('button', { name: 'Estantería', exact: true }).click()
  await page.getByRole('button', { name: 'Estantería', exact: true }).click()
  await page.getByLabel('Elemento seleccionado').selectOption({ label: 'A0' })
  await expect(page.getByLabel('Código', { exact: true })).toHaveValue('A0')
  await expect(page.getByLabel('Elemento seleccionado').locator('option')).toHaveCount(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('encuadra la altura completa en almacenes pequeños', async ({ page }) => {
  await page.goto('/app')
  const doc = { format: 'optiruta-warehouse', version: 1, id: 'tall', name: 'Prueba de altura', widthMm: 5000, depthMm: 5000, racks: [{ id: 'tall-rack', code: 'A1', alias: '', color: '#337b78', xMm: 1000, yMm: 1000, widthMm: 2000, depthMm: 1000, heightMm: 100000, rotation: 0, columns: 1, access: 'front', reverse: false, levels: [] }] }
  await page.getByLabel('Abrir archivo de almacén').setInputFiles({ name: 'altura.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) })
  await expect(page.locator('.document-title')).toContainText('Prueba de altura')
  await page.getByRole('button', { name: 'Encuadrar', exact: true }).click()
  await page.screenshot({ path: 'artifacts/editor-altura.png' })
  await expect(page.getByRole('alert')).toHaveCount(0)
})

