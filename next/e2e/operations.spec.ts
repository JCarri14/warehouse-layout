import { warehouseAction } from './helpers'
import { test } from './fixtures'
import { expect, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import { OrthographicCamera, Vector3 } from 'three'

async function exported(page: Page) {
  const download = page.waitForEvent('download')
  await warehouseAction(page, 'Guardar almacén')
  return JSON.parse(await fs.readFile((await (await download).path())!, 'utf8'))
}
async function setup(page: Page) {
  await page.goto('/app')
  await page.getByRole('button', { name: 'Añadir estantería', exact: true }).first().click()
  await page.getByRole('button', { name: 'Superior', exact: true }).click()
}
async function floorPoint(page: Page, x: number, y: number) {
  const b = (await page.locator('.viewport canvas').boundingBox())!
  const half = Math.max(34 / 2 * 1.15 + 2, (32 / 2 * 1.15 + 2) / (b.width / b.height))
  const scale = b.height / (2 * half)
  return { x: b.x + b.width / 2 + (x - 16) * scale, y: b.y + b.height / 2 + (y - 17) * scale }
}
test('duplicar, girar, eliminar y recorrer el historial sin cambiar la cámara', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Duplicar', exact: true }).click()
  await expect(page.locator('.element-row')).toHaveCount(2)
  await expect(page.getByLabel('Código', { exact: true })).toHaveValue('A1')
  await page.getByRole('button', { name: 'Girar 90°', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Giro', exact: true })).toHaveValue('90')
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click()
  await expect(page.locator('.element-row')).toHaveCount(1)
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
  await expect(page.locator('.element-row')).toHaveCount(2)
  await page.getByRole('complementary', { name: 'Elementos del almacén' }).getByRole('button', { name: /A1/ }).click()
  await expect(page.getByRole('combobox', { name: 'Giro', exact: true })).toHaveValue('90')
  await page.getByRole('button', { name: 'Rehacer', exact: true }).click()
  await expect(page.locator('.element-row')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Superior', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await warehouseAction(page, 'Nuevo almacén')
  await page.getByRole('dialog').getByRole('button', { name: 'Descartar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Deshacer', exact: true })).toBeDisabled()
})
test('arrastre ajustado, cancelación, rechazo de límites y una sola acción para deshacer', async ({ page }) => {
  await setup(page)
  const before = await exported(page)
  const start = await floorPoint(page, 4, 1.6), end = await floorPoint(page, 6.27, 6.93)
  await page.getByLabel('Paso de cuadrícula').selectOption('500')
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 12 }); await page.mouse.up()
  const moved = await exported(page)
  expect(moved.racks[0]).toMatchObject({ xMm: 3500, yMm: 6500 })
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
  expect(await exported(page)).toEqual(before)
  await expect(page.getByRole('button', { name: 'Rehacer', exact: true })).toBeEnabled()
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 5 }); await page.keyboard.press('Escape'); await page.mouse.up()
  expect(await exported(page)).toEqual(before)
  await expect(page.getByRole('button', { name: 'Rehacer', exact: true })).toBeEnabled()
  const outside = await floorPoint(page, .1, 1.6)
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(outside.x, outside.y, { steps: 5 }); await page.mouse.up()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(await exported(page)).toEqual(before)
})
test('atajos respetan campos, propiedades pendientes y el punto guardado', async ({ page }) => {
  await setup(page)
  await exported(page)
  await page.locator('.viewport canvas').focus()
  await page.keyboard.press('Control+d')
  await expect(page.locator('.element-row')).toHaveCount(2)
  await page.keyboard.press('Control+z')
  await expect(page.locator('.element-row')).toHaveCount(1)
  await expect(page.locator('.status-meta')).toContainText('Sin cambios pendientes')
  await page.keyboard.press('Control+Shift+z')
  await expect(page.locator('.element-row')).toHaveCount(2)
  await page.getByLabel('Nombre opcional').fill('Borrador')
  await page.keyboard.press('Delete')
  await expect(page.locator('.element-row')).toHaveCount(2)
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Propiedades sin aplicar')
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Nombre opcional')).toHaveValue('Borrador')
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
  await page.getByRole('button', { name: 'Añadir estantería', exact: true }).first().click()
  await expect(page.getByRole('button', { name: 'Rehacer', exact: true })).toBeDisabled()
})

test('previsualiza colisiones y permite cancelar por pérdida del gesto sin tocar el historial', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Añadir estantería', exact: true }).first().click()
  const before = await exported(page)
  const undoTitle = await page.getByRole('button', { name: 'Deshacer', exact: true }).getAttribute('title')
  const start = await floorPoint(page, 4, 1.6), blocked = await floorPoint(page, 11, 1.6)
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(blocked.x, blocked.y, { steps: 8 })
  await expect(page.locator('.drag-status.invalid')).toBeVisible()
  await page.screenshot({ path: 'artifacts/editor-arrastre-invalido.png' })
  await page.mouse.up()
  await expect(page.getByRole('alert')).toContainText('solapan')
  expect(await exported(page)).toEqual(before)
  const free = await floorPoint(page, 4, 7)
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(free.x, free.y, { steps: 5 })
  await page.locator('.viewport canvas').evaluate(c => c.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })))
  await page.mouse.up()
  expect(await exported(page)).toEqual(before)
  await expect(page.getByRole('button', { name: 'Deshacer', exact: true })).toHaveAttribute('title', undoTitle!)
})

test('mover vista y Espacio navegan sin mover estanterías ni crear acciones', async ({ page }) => {
  await setup(page)
  const before = await exported(page), undoTitle = await page.getByRole('button', { name: 'Deshacer', exact: true }).getAttribute('title')
  const start = await floorPoint(page, 4, 1.6), end = await floorPoint(page, 6, 5)
  await page.getByRole('button', { name: 'Mover vista', exact: true }).click()
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 5 }); await page.mouse.up()
  expect(await exported(page)).toEqual(before)
  await page.getByRole('button', { name: 'Encuadrar', exact: true }).click()
  await page.getByRole('button', { name: 'Seleccionar y mover', exact: true }).click()
  await page.locator('.viewport canvas').focus(); await page.keyboard.down('Space')
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 5 }); await page.mouse.up(); await page.keyboard.up('Space')
  expect(await exported(page)).toEqual(before)
  await expect(page.getByRole('button', { name: 'Deshacer', exact: true })).toHaveAttribute('title', undoTitle!)
})

test('arrastra en isométrica sobre un plano horizontal y admite movimiento sin ajuste', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Isométrica', exact: true }).click()
  await page.getByLabel('Paso de cuadrícula').selectOption('0')
  const b = (await page.locator('.viewport canvas').boundingBox())!
  const c = new OrthographicCamera(-1, 1, 1, -1, .1, 10000), target = new Vector3(16, 1.5, 17), distance = 34 * 1.7 + 10
  c.position.copy(target).add(new Vector3(distance * .65, distance * .8, distance * .65)); c.lookAt(target); c.updateMatrixWorld()
  let halfW = 0, halfH = 0
  const inverse = c.quaternion.clone().invert()
  for (const x of [-16, 16]) for (const y of [-1.5, 1.5]) for (const z of [-17, 17]) { const p = new Vector3(x, y, z).applyQuaternion(inverse); halfW = Math.max(halfW, Math.abs(p.x)); halfH = Math.max(halfH, Math.abs(p.y)) }
  const half = Math.max(halfH * 1.15 + 2, (halfW * 1.15 + 2) / (b.width / b.height))
  c.left = -half * b.width / b.height; c.right = -c.left; c.top = half; c.bottom = -half; c.updateProjectionMatrix()
  const point = (x: number, z: number) => { const p = new Vector3(x, 3, z).project(c); return { x: b.x + (p.x + 1) * b.width / 2, y: b.y + (1 - p.y) * b.height / 2 } }
  const start = point(4, 1.6), end = point(6.237, 6.912)
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 8 })
  await expect(page.locator('.drag-status')).toBeVisible()
  await page.screenshot({ path: 'artifacts/editor-arrastre-isometrico.png' })
  await page.mouse.up()
  const doc = await exported(page)
  expect(doc.racks[0].xMm).toBeCloseTo(3237, -1); expect(doc.racks[0].yMm).toBeCloseTo(6312, -1)
  expect(doc.racks[0].xMm % 100).not.toBe(0)
})

