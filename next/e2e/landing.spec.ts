import { test, expect } from '@playwright/test'

test('presentación independiente, traducida y sin cargar el visor', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => requests.push(request.url()))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Diseña tu almacén en 3D.')
  await expect(page.locator('.app-header')).toHaveCount(0)
  await expect(page.locator('canvas')).toHaveCount(0)
  await expect(page.locator('.landing-preview img')).toHaveJSProperty('naturalWidth', 1440)
  expect(requests.some(url => /WarehouseViewport|StartRack|OperationsPanel/.test(url))).toBe(false)
  await page.getByLabel('Idioma').selectOption('en')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Design your warehouse in 3D.')
  await expect(page).toHaveTitle('3D warehouse layout planner | Warehouse Layout')
  for (const width of [1440, 800, 390]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.locator('.landing-page').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.screenshot({ path: `artifacts/landing-${width}.png`, fullPage: true })
  }
  await page.getByRole('link', { name: 'Start with my warehouse' }).click()
  await expect(page.getByRole('heading', { name: 'Your warehouses' })).toBeVisible()
})

test('Inicio conserva el borrador al abrir la presentación y muestra el plano actual', async ({ page, context }) => {
  await page.goto('/app')
  await page.getByRole('button', { name: 'Abrir ejemplo detallado', exact: true }).click()
  await page.getByLabel('Nombre del almacén', { exact: true }).fill('Borrador conservado')
  await page.getByRole('button', { name: 'Ir a Inicio', exact: true }).click()
  await expect(page.locator('.start-current svg rect')).not.toHaveCount(1)
  await expect(page.locator('.start-current')).toContainText('Cambios sin guardar')
  const opened = context.waitForEvent('page')
  await page.getByRole('link', { name: /Conoce Warehouse Layout/ }).click()
  const landing = await opened
  await expect(landing.getByRole('heading', { level: 1 })).toHaveText('Diseña tu almacén en 3D.')
  await landing.close()
  await page.screenshot({ path: 'artifacts/inicio-nuevo.png' })
  await page.getByRole('button', { name: 'Seguir con el plano actual' }).click()
  await expect(page.getByLabel('Nombre del almacén', { exact: true })).toHaveValue('Borrador conservado')
})



test('una sesión nueva destaca y abre el último almacén', async ({ page }) => {
  await page.goto('/app')
  await page.getByRole('button', { name: 'Explorar un ejemplo', exact: true }).click()
  await page.getByRole('button', { name: 'Ir a Inicio', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Abrir reciente: Almacén detallado de escritorio' })).toBeVisible()
  await page.reload()
  await expect(page.locator('.app-header')).toBeVisible()
  await expect(page.locator('.recovery-loading')).toBeHidden()
  await expect(page.locator('.recovery-loading')).toBeHidden()
  if (await page.getByRole('button', { name: 'Descartar copia' }).isVisible()) await page.getByRole('button', { name: 'Descartar copia' }).click()
  await expect(page.locator('.start-current')).toContainText('Último almacén')
  await page.getByRole('button', { name: 'Continuar con este almacén', exact: true }).click()
  await expect(page.getByLabel('Nombre del almacén', { exact: true })).toHaveValue('Almacén detallado de escritorio')
})



test('rutas públicas, enlace antiguo y recarga directa de la aplicación', async ({ page }) => {
  await page.goto('/?page=welcome')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Diseña tu almacén en 3D.')
  await page.getByRole('link', { name: 'Abrir aplicación', exact: false }).first().click()
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByRole('heading', { name: 'Tus almacenes' })).toBeVisible()
  await page.reload()
  await expect(page.locator('.app-header')).toBeVisible()
  await expect(page.locator('.recovery-loading')).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Tus almacenes' })).toBeVisible()
  await page.goto('/app/')
  await expect(page.getByRole('heading', { name: 'Tus almacenes' })).toBeVisible()
})


