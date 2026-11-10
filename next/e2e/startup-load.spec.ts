import { test, expect } from '@playwright/test'

test('Inicio funciona antes de cargar el visor y la animación', async ({ page }) => {
  const held: Array<() => Promise<void>> = []
  let release = false
  await page.route(/\/src\/(viewport\/WarehouseViewport|editor\/StartRack)\.tsx/, route => {
    if (release) return route.continue()
    held.push(() => route.continue())
  })
  await page.goto('/app', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Tus almacenes' })).toBeVisible({ timeout: 5000 })
  await expect(page.getByRole('button', { name: 'Nuevo almacén', exact: true })).toBeEnabled()
  await expect(page.locator('.viewport canvas')).toHaveCount(0)
  await page.getByRole('button', { name: 'Seguir con el plano actual', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Cargando plano…' })).toBeVisible()
  release = true
  await Promise.all(held.map(resume => resume()))
  await expect(page.locator('.canvas-panel canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Ir a Inicio', exact: true }).click()
  await page.getByRole('button', { name: 'Seguir con el plano actual', exact: true }).click()
  await expect(page.locator('.canvas-panel canvas')).toBeVisible()
})

test('pantalla pequeña no descarga decoración 3D oculta', async ({ page }) => {
  await page.setViewportSize({ width: 780, height: 900 })
  const requested: string[] = []
  page.on('request', request => { if (/\/(StartRack|WarehouseViewport)\.tsx/.test(request.url())) requested.push(request.url()) })
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Tus almacenes' })).toBeVisible()
  await page.waitForTimeout(600)
  expect(requested).toEqual([])
  await page.getByRole('button', { name: 'Seguir con el plano actual', exact: true }).click()
  await expect(page.locator('.canvas-panel canvas')).toBeVisible()
})

