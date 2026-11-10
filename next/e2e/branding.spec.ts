import { test } from './fixtures'
import { expect } from '@playwright/test'
import { changeLanguage } from './helpers'

test('Warehouse Layout e icono WL en cabecera, Inicio y pestaña sin romper tamaños pequeños', async ({ page }) => {
  await page.goto('/app')
  await expect(page.locator('.brand strong')).toHaveText('Warehouse Layout')
  await expect(page).toHaveTitle(/Warehouse Layout$/)
  const icon = page.locator('.brand img')
  await expect(icon).toBeVisible()
  await expect.poll(() => icon.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(64)
  const favicon = page.locator('link[rel="icon"]')
  const response = await page.request.get((await favicon.getAttribute('href'))!)
  expect(response.ok()).toBe(true); expect(response.headers()['content-type']).toContain('image/png')
  for (const width of [1440, 1100, 780, 480]) {
    await page.setViewportSize({ width, height: 800 })
    await expect(icon).toBeInViewport()
    expect(await page.locator('.app-header').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    await expect(page.getByRole('button', { name: 'Ajustes', exact: true })).toBeInViewport()
  }
  await page.setViewportSize({ width: 1100, height: 740 })
  await changeLanguage(page, 'en')
  await expect(page.locator('.brand strong')).toHaveText('Warehouse Layout')
  await page.getByRole('button', { name: 'Go to Home', exact: true }).click()
  await expect(page.locator('.start-intro>.eyebrow')).toHaveText('WAREHOUSE LAYOUT')
  expect(await page.locator('body').innerText()).not.toMatch(/optiruta/i)
  await page.screenshot({ path: 'artifacts/warehouse-layout-inicio.png' })
  await page.getByRole('button', { name: 'Continue with the current plan' }).click()
  await page.screenshot({ path: 'artifacts/warehouse-layout-editor.png' })
})

