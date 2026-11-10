import { warehouseAction } from './helpers'
import { test } from './fixtures'
import { expect, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
const inventory = 'referencia;descripcion;ubicacion;cantidad\nREF-1;Tornillos;A10101;20\nREF-2;Arandelas;B10102;30\nREF-3;Sin colocar;Z90101;5\n'
const order = 'referencia;descripcion;ubicacion;cantidad\nREF-1;Tornillos;A10101;2\nREF-2;Arandelas;B10102;3\n'
async function importCsv(page: Page, kind: 'inventory' | 'order', source: string) {
  await page.getByLabel(kind === 'inventory' ? 'Archivo de inventario' : 'Archivo de OT').setInputFiles({ name: `${kind}.csv`, mimeType: 'text/csv', buffer: Buffer.from(source) })
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: kind === 'inventory' ? 'Importar inventario' : 'Importar OT', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
test('inventario, OT, recorrido e informes sin servicios externos', async ({ page }) => {
  test.setTimeout(90000)
  const errors: string[] = [], external: string[] = []
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:5173') && !/^(blob:|data:)/.test(r.url())) external.push(r.url()) })
  await page.goto('/app')
  await warehouseAction(page, 'Abrir ejemplo')
  await page.getByRole('button', { name: 'Inventario', exact: true }).click()
  await importCsv(page, 'inventory', inventory)
  await expect(page.getByRole('table')).toContainText('REF-1')
  await expect(page.getByRole('table')).toContainText('Z90101')
  await page.getByLabel('Buscar inventario').fill('Arandelas')
  await expect(page.getByRole('table')).not.toContainText('REF-1')
  await page.getByLabel('Buscar inventario').fill('')
  await page.getByRole('button', { name: 'Órdenes de trabajo', exact: true }).click()
  await importCsv(page, 'order', order)
  await expect(page.getByLabel('Cantidad línea 1')).toHaveValue('2')
  await page.getByLabel('Cantidad línea 1').fill('2,5')
  const saved = page.waitForEvent('download'); await page.getByRole('button', { name: 'Guardar OT', exact: true }).click()
  const savedOrder = JSON.parse(await fs.readFile((await (await saved).path())!, 'utf8'))
  expect(savedOrder.order.lines[0].quantityText).toBe('2,5')
  await page.getByLabel('Cantidad línea 1').fill('99')
  await page.getByLabel('Abrir borrador de OT').setInputFiles({ name: 'guardada.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(savedOrder)) })
  await page.getByRole('button', { name: 'Abrir esta OT', exact: true }).click()
  await expect(page.getByLabel('Cantidad línea 1')).toHaveValue('2,5')
  await page.getByRole('button', { name: 'Recorridos', exact: true }).click()
  await page.getByRole('button', { name: 'Calcular ruta', exact: true }).click()
  await expect(page.locator('.route-results')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('.route-results')).toContainText('2')
  await page.getByRole('button', { name: 'Siguiente parada', exact: true }).click()
  await page.screenshot({ path: 'artifacts/operacion-recorrido-1440.png' })
  await page.getByRole('button', { name: 'Informes', exact: true }).click()
  await page.getByLabel('Contenido del informe').selectOption('route')
  const pdfEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Descargar PDF', exact: true }).click()
  const pdf = await fs.readFile((await (await pdfEvent).path())!); expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
  const csvEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Descargar CSV', exact: true }).click()
  const csv = await fs.readFile((await (await csvEvent).path())!, 'utf8'); expect(csv).toContain('REF-1'); expect(csv).toContain('2,5')
  await page.setViewportSize({ width: 1100, height: 740 }); await page.screenshot({ path: 'artifacts/operacion-informes-1100.png' })
  expect(errors).toEqual([]); expect(external).toEqual([])
})
test('recupera almacén y propiedades pendientes después de recargar', async ({ page }) => {
  await page.goto('/app')
  await page.getByLabel('Nombre del almacén').fill('Almacén recuperado')
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await page.getByLabel('Nombre del almacén').fill('Texto sin aplicar')
  await expect(page.locator('.recovery-status')).toContainText('Copia local actualizada')
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('optiruta.workspace.recovery.v1') || '{}').session?.pendingEdit?.values.name)).toBe('Texto sin aplicar')
  page.on('dialog', d => d.accept()); await page.reload()
  await expect(page.getByRole('dialog')).toContainText('sesión para recuperar')
  await page.getByRole('button', { name: 'Recuperar sesión', exact: true }).click()
  await expect(page.getByLabel('Nombre del almacén')).toHaveValue('Texto sin aplicar')
  await expect(page.locator('.document-title')).toContainText('Almacén recuperado')
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(page.getByLabel('Nombre del almacén')).toHaveValue('Almacén recuperado')
})
test('recupera inventario y borrador de OT, y rechaza una importación errónea sin sustituirlos', async ({ page }) => {
  await page.goto('/app')
  await warehouseAction(page, 'Abrir ejemplo')
  await page.getByRole('button', { name: 'Inventario', exact: true }).click(); await importCsv(page, 'inventory', inventory)
  await page.getByRole('button', { name: 'Órdenes de trabajo', exact: true }).click(); await importCsv(page, 'order', order)
  await page.getByLabel('Cantidad línea 1').fill('pendiente')
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('optiruta.workspace.recovery.v1') || '{}').session?.order.lines[0]?.quantityText)).toBe('pendiente')
  page.on('dialog', d => d.accept()); await page.reload(); await page.getByRole('button', { name: 'Recuperar sesión', exact: true }).click()
  await expect(page.getByLabel('Cantidad línea 1')).toHaveValue('pendiente')
  await page.getByRole('button', { name: 'Inventario', exact: true }).click()
  await page.getByLabel('Archivo de inventario').setInputFiles({ name: 'mal.csv', mimeType: 'text/csv', buffer: Buffer.from('referencia;ubicacion;cantidad\nX;A10101;mal') })
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Importar inventario', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape'); await expect(page.getByRole('table')).toContainText('REF-1')
})
test('los cambios de OT invalidan el recorrido anterior', async ({ page }) => {
  await page.goto('/app'); await warehouseAction(page, 'Abrir ejemplo')
  await page.getByRole('button', { name: 'Órdenes de trabajo', exact: true }).click(); await importCsv(page, 'order', order)
  await page.getByRole('button', { name: 'Recorridos', exact: true }).click(); await page.getByRole('button', { name: 'Calcular ruta', exact: true }).click()
  await expect(page.locator('.route-results')).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Órdenes de trabajo', exact: true }).click(); await page.getByLabel('Cantidad línea 1').fill('0')
  await page.getByRole('button', { name: 'Recorridos', exact: true }).click(); await expect(page.getByRole('button', { name: 'Calcular ruta', exact: true })).toBeDisabled()
  await expect(page.locator('.route-results')).toHaveCount(0)
})

test('importa el informe Excel real del proyecto mediante la vista previa compartida', async ({ page }) => {
  await page.goto('/app'); await page.getByRole('button', { name: 'Órdenes de trabajo', exact: true }).click()
  await page.getByLabel('Archivo de OT').setInputFiles('C:/Dev/optiruta/ejemplo-informe-ERP.xlsx')
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Importar OT', exact: true })).toBeEnabled({ timeout: 15000 })
  await page.getByRole('dialog').getByRole('button', { name: 'Importar OT', exact: true }).click()
  await expect(page.getByLabel('Cantidad línea 1')).not.toHaveValue('')
  await expect(page.locator('.order-summary')).not.toContainText('0 líneas')
})

test('un fallo de cuota avisa sin impedir guardar un archivo independiente', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) { if (key === 'optiruta.workspace.recovery.v1') throw new DOMException('quota', 'QuotaExceededError'); original.call(this, key, value) }
  })
  await page.goto('/app'); await page.getByLabel('Nombre del almacén').fill('Sin espacio'); await page.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(page.locator('.recovery-status')).toContainText('sin copia')
  const event = page.waitForEvent('download'); await warehouseAction(page, 'Guardar almacén')
  expect((await event).suggestedFilename()).toContain('Sin espacio')
})

test('una descripción larga de inventario no puede invalidar la OT ni la recuperación', async ({ page }) => {
  await page.goto('/app'); await page.getByRole('button', { name: 'Inventario', exact: true }).click()
  await importCsv(page, 'inventory', `referencia;descripcion;ubicacion;cantidad\nLARGO;${'x'.repeat(5000)};A10101;1`)
  await page.getByRole('checkbox', { name: 'Seleccionar LARGO · A10101', exact: true }).check()
  await page.getByRole('button', { name: 'Añadir a orden…', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar artículos', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('longitud')
  await page.getByRole('button', { name: 'Órdenes de trabajo', exact: true }).click()
  await expect(page.locator('.order-summary')).toContainText('0 líneas')
  await expect(page.locator('.recovery-status')).toContainText('Copia local actualizada')
})


test('conserva las opciones aplicadas del recorrido al recuperar la sesión', async ({ page }) => {
  await page.goto('/app')
  await warehouseAction(page, 'Abrir ejemplo')
  await page.getByRole('button', { name: 'Recorridos', exact: true }).click()
  await page.getByText('Inicio, destino y precisión', { exact: true }).click()
  await page.getByLabel(/^Inicio · X/).fill('0,5')
  await page.getByRole('button', { name: 'Aplicar opciones', exact: true }).click()
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('optiruta.workspace.recovery.v1') || '{}').session?.settings?.start.xMm)).toBe(500)
  page.on('dialog', d => d.accept()); await page.reload()
  await page.getByRole('button', { name: 'Recuperar sesión', exact: true }).click()
  await page.getByText('Inicio, destino y precisión', { exact: true }).click()
  await expect(page.getByLabel(/^Inicio · X/)).toHaveValue('0,5')
  await expect(page.getByText('Precisión automática del cálculo. La cuadrícula se configura en Diseñar.', { exact: true })).toBeVisible()
})


test('permite elegir una cabecera no estándar bajo el título del informe', async ({ page }) => {
  await page.goto('/app')
  await warehouseAction(page, 'Abrir ejemplo')
  await page.getByRole('button', { name: 'Inventario', exact: true }).click()
  const source = 'Informe de existencias\nFecha 09/11/2026\nIdentificador interno;Texto libre;Hueco;Existencia\nP-CAB;Material de prueba;A10101;7\n'
  await page.getByLabel('Archivo de inventario').setInputFiles({ name: 'cabecera.csv', mimeType: 'text/csv', buffer: Buffer.from(source) })
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Fila de cabecera', { exact: true }).selectOption('2')
  await dialog.getByRole('combobox', { name: /^Referencia/ }).selectOption('0')
  await dialog.getByRole('combobox', { name: /^Descripción/ }).selectOption('1')
  await dialog.getByRole('combobox', { name: /^Ubicación/ }).selectOption('2')
  await dialog.getByRole('combobox', { name: /^Cantidad/ }).selectOption('3')
  await expect(dialog).toContainText('1 líneas para importar')
  await dialog.getByRole('button', { name: 'Importar inventario', exact: true }).click()
  await expect(page.getByRole('table')).toContainText('P-CAB')
})



