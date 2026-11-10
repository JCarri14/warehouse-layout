import { changeLanguage } from './helpers'
import { test, expect } from '@playwright/test'
import path from 'node:path'

test('recientes sobreviven a una recarga y quitar no elimina archivos', async ({ page }) => {
  await page.goto('/app')
  await page.getByRole('button', { name: 'Abrir ejemplo detallado', exact: true }).click()
  await page.getByRole('button', { name: 'Ir a Inicio', exact: true }).click()
  const recent = page.getByRole('button', { name: 'Abrir reciente: Almacén detallado de escritorio' })
  await expect(recent).toBeVisible()
  await page.screenshot({ path: path.resolve('artifacts/inicio-recientes.png') })
  await page.reload()
  await expect(page.locator('.app-header')).toBeVisible()
  await expect(page.locator('.recovery-loading')).toBeHidden()
  if (await page.getByRole('button', { name: 'Descartar copia' }).isVisible()) await page.getByRole('button', { name: 'Descartar copia' }).click()
  await expect(recent).toBeVisible()
  await recent.click()
  await expect(page.getByLabel('Nombre del almacén')).toHaveValue('Almacén detallado de escritorio')
  await page.getByRole('button', { name: 'Ir a Inicio', exact: true }).click()
  await page.getByRole('button', { name: 'Quitar reciente: Almacén detallado de escritorio' }).click()
  await expect(recent).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Tu próximo almacén empieza aquí' })).toBeVisible()
})

test('pestañas de estantería, teclado y ventanas de portátil', async ({ page }) => {
  await page.goto('/app')
  await page.getByRole('button', { name: 'Nuevo almacén', exact: true }).click()
  await page.getByRole('button', { name: 'Añadir estantería', exact: true }).first().click()
  await page.getByLabel('Nombre opcional').fill('Borrador entre pestañas')
  await page.getByRole('tab', { name: 'General', exact: true }).focus()
  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: 'Niveles', exact: true })).toBeFocused()
  await page.getByLabel('Cota nivel 2', { exact: true }).fill('1,5')
  await page.getByRole('tab', { name: 'General', exact: true }).click()
  await expect(page.getByLabel('Nombre opcional')).toHaveValue('Borrador entre pestañas')
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click()
  for (const width of [1440, 1100]) {
    await page.setViewportSize({ width, height: 740 })
    await expect(page.getByRole('button', { name: 'Aplicar', exact: true })).toBeInViewport()
    expect(await page.locator('.canvas-panel').evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(300)
    await page.screenshot({ path: path.resolve(`test-results/properties-${width}.png`) })
  }
  await page.getByRole('button', { name: 'Ir a Inicio', exact: true }).click()
  await page.screenshot({ path: path.resolve('test-results/start-1100.png') })
})

test('inicio y pestañas conservan el borrador', async ({ page }) => {
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Tus almacenes' })).toBeVisible()
  await page.getByRole('button', { name: 'Nuevo almacén', exact: true }).click()
  await page.getByLabel('Nombre del almacén').fill('Almacén pestañas')
  await page.getByRole('tab', { name: 'Ubicaciones', exact: true }).click()
  await page.getByLabel('Formato de ubicación').fill('{S}-{N}-{C}')
  await page.getByRole('tab', { name: 'General', exact: true }).click()
  await expect(page.getByLabel('Nombre del almacén')).toHaveValue('Almacén pestañas')
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await page.getByRole('button', { name: 'Ir a Inicio', exact: true }).click()
  await page.getByRole('button', { name: 'Seguir con el plano actual' }).click()
  await expect(page.getByLabel('Nombre del almacén')).toHaveValue('Almacén pestañas')
})

test('inicio en inglés y apertura automática del último almacén', async ({ page }) => {
  await page.goto('/app')
  await page.getByRole('button', { name: 'Abrir ejemplo detallado', exact: true }).click()
  await page.getByRole('button', { name: 'Ir a Inicio', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Abrir reciente: Almacén detallado de escritorio' })).toBeVisible()
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await page.getByLabel('Al iniciar', { exact: true }).selectOption('last')
  await changeLanguage(page, 'en')
  await expect(page.getByRole('heading', { name: 'Your warehouses' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Recent', exact: true })).toBeVisible()
  // Simulate a fresh launch after intentionally clearing session recovery.
  await page.addInitScript(() => localStorage.removeItem('optiruta.workspace.recovery.v1'))
  await page.reload()
  await expect(page.locator('.app-header')).toBeVisible()
  await expect(page.locator('.recovery-loading')).toBeHidden()
  await expect(page.getByLabel('Warehouse name', { exact: true })).toHaveValue('Almacén detallado de escritorio')
})

test('un archivo desaparecido conserva una copia local utilizable', async ({ page }) => {
  await page.goto('/app')
  await page.evaluate(async () => {
    // Use a real serializable browser file handle rather than a picker double.
    const root = await navigator.storage.getDirectory()
    const handle = await root.getFileHandle('recent-test.json', { create: true })
    const { createWarehouse } = await import('/src/warehouse/document.ts')
    const { rememberWarehouse } = await import('/src/persistence/recentWarehouses.ts')
    const doc = { ...createWarehouse(), name: 'Archivo retirado' }
    const writable = await handle.createWritable()
    await writable.write(JSON.stringify(doc)); await writable.close()
    await rememberWarehouse(doc, handle.name, handle)
    await root.removeEntry('recent-test.json')
  })
  await page.reload()
  await expect(page.locator('.app-header')).toBeVisible()
  await expect(page.locator('.recovery-loading')).toBeHidden()
  await page.getByRole('button', { name: 'Abrir reciente: Archivo retirado' }).click()
  await expect(page.locator('.start-recents').getByRole('alert')).toContainText('No se encuentra el archivo original')
  await page.getByRole('button', { name: 'Abrir copia local', exact: true }).click()
  await expect(page.getByLabel('Nombre del almacén')).toHaveValue('Archivo retirado')
  await page.getByRole('button', { name: 'Ir a Inicio', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Abrir copia local', exact: true })).toBeVisible()
})


