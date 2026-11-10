import { test } from './fixtures'
import { expect, type Page, type Locator } from '@playwright/test'
import fs from 'node:fs/promises'
import { warehouseAction } from './helpers'
import type { WarehouseDocument } from '../src/warehouse/document'

async function exported(page: Page): Promise<WarehouseDocument> {
  const event = page.waitForEvent('download')
  await warehouseAction(page, 'Guardar almacén')
  return JSON.parse(await fs.readFile((await (await event).path())!, 'utf8'))
}
async function floorPoint(canvas: Locator, x: number, y: number, width = 32, depth = 34) {
  const b = (await canvas.boundingBox())!
  const half = Math.max(depth / 2 * 1.15 + 2, (width / 2 * 1.15 + 2) / (b.width / b.height))
  const scale = b.height / (2 * half)
  return { x: b.x + b.width / 2 + (x - width / 2) * scale, y: b.y + b.height / 2 + (y - depth / 2) * scale }
}

test('amplía los cuatro bordes por celdas, desplaza contenido y registra un solo deshacer', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/app')
  await expect(page.getByRole('button', { name: 'Cambiar tamaño del almacén', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Añadir estantería', exact: true }).first().click()
  const baseline = await exported(page)
  await page.getByRole('button', { name: 'Superior', exact: true }).click()
  const canvas = page.locator('.canvas-panel canvas')
  for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
    const horizontal = edge === 'left' || edge === 'right'
    const start = await floorPoint(canvas, edge === 'left' ? 0 : edge === 'right' ? 32 : 16, edge === 'top' ? 0 : edge === 'bottom' ? 34 : 17)
    const end = await floorPoint(canvas, edge === 'left' ? -1.1 : edge === 'right' ? 33.1 : 16, edge === 'top' ? -1.1 : edge === 'bottom' ? 35.1 : 17)
    await page.mouse.move(start.x, start.y)
    await expect(canvas).toHaveCSS('cursor', horizontal ? 'ew-resize' : 'ns-resize')
    await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 7 })
    if (edge === 'left') await page.screenshot({ path: 'artifacts/almacen-redimensionar-preview.png' })
    await page.mouse.up()
    const resized = await exported(page)
    expect(resized.widthMm).toBe(baseline.widthMm + (horizontal ? 1000 : 0))
    expect(resized.depthMm).toBe(baseline.depthMm + (horizontal ? 0 : 1000))
    expect(resized.racks[0]).toMatchObject({ id: baseline.racks[0].id, code: baseline.racks[0].code, xMm: baseline.racks[0].xMm + (edge === 'left' ? 1000 : 0), yMm: baseline.racks[0].yMm + (edge === 'top' ? 1000 : 0) })
    await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
    expect(await exported(page)).toEqual(baseline)
    await page.getByRole('button', { name: 'Rehacer', exact: true }).click()
    expect(await exported(page)).toEqual(resized)
    await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
    expect(await exported(page)).toEqual(baseline)
  }
  const start = await floorPoint(canvas, 0, 17), blocked = await floorPoint(canvas, 2.1, 17)
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(blocked.x, blocked.y, { steps: 7 })
  await expect(page.locator('.drag-status.invalid')).toBeVisible()
  await page.mouse.up()
  expect(await exported(page)).toEqual(baseline)
  const out = await floorPoint(canvas, -2.1, 17)
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(out.x, out.y, { steps: 7 })
  await page.keyboard.press('Escape'); await page.mouse.up()
  expect(await exported(page)).toEqual(baseline)
})

test('marca y mueve inicio y destino en el plano, rechaza obstáculos y permite cancelar', async ({ page }) => {
  await page.goto('/app')
  await page.getByRole('button', { name: 'Añadir estantería', exact: true }).first().click()
  await page.getByRole('button', { name: 'Recorridos', exact: true }).click()
  const canvas = page.locator('.operations-plan canvas')
  await page.getByText('Inicio, destino y precisión', { exact: true }).click()
  await page.getByRole('button', { name: 'Marcar inicio', exact: true }).click()
  const occupied = await floorPoint(canvas, 4, 1.6)
  await page.mouse.click(occupied.x, occupied.y)
  await expect(page.locator('.drag-status.invalid')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Marcar inicio', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const start = await floorPoint(canvas, 12.5, 12.5)
  await page.mouse.click(start.x, start.y)
  const number = async (name: string) => Number((await page.getByLabel(name, { exact: true }).inputValue()).replace(',', '.'))
  expect(Math.abs(await number('Inicio · X') - 12.5)).toBeLessThan(.15)
  expect(Math.abs(await number('Inicio · Y') - 12.5)).toBeLessThan(.15)
  await page.getByRole('button', { name: 'Marcar destino', exact: true }).click()
  const end = await floorPoint(canvas, 20.5, 20.5)
  await page.mouse.click(end.x, end.y)
  await expect(page.getByLabel('Volver al punto de inicio', { exact: true })).not.toBeChecked()
  expect(Math.abs(await number('Destino · X') - 20.5)).toBeLessThan(.15)
  expect(Math.abs(await number('Destino · Y') - 20.5)).toBeLessThan(.15)
  const moved = await floorPoint(canvas, 14.5, 12.5)
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(moved.x, moved.y, { steps: 6 }); await page.mouse.up()
  expect(Math.abs(await number('Inicio · X') - 14.5)).toBeLessThan(.15)
  await page.getByRole('button', { name: 'Cambiar destino', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Cambiar destino', exact: true })).toHaveAttribute('aria-pressed', 'false')
  expect(Math.abs(await number('Destino · X') - 20.5)).toBeLessThan(.15)
  await page.screenshot({ path: 'artifacts/recorridos-marcar-puntos.png' })
})

test('las coordenadas pendientes se aplican o cancelan antes de marcar otro punto', async ({ page }) => {
  await page.goto('/app')
  await page.getByRole('button', { name: 'Superior', exact: true }).click()
  await page.getByRole('button', { name: 'Recorridos', exact: true }).click()
  await page.getByRole('button', { name: 'Marcar inicio', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Marcar inicio', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await page.getByText('Inicio, destino y precisión', { exact: true }).click()
  const start = page.getByLabel('Inicio · X', { exact: true })
  const original = await start.inputValue()
  await start.fill('10,5')
  await expect(page.getByRole('button', { name: 'Marcar inicio', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Marcar destino', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Cancelar opciones', exact: true }).click()
  await expect(start).toHaveValue(original)
  await expect(page.getByRole('button', { name: 'Marcar destino', exact: true })).toBeEnabled()
})

