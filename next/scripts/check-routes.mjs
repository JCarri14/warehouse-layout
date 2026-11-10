import { chromium, expect } from '@playwright/test'
const browser = await chromium.launch()
try {
 const page = await browser.newPage()
 for (const route of ['/', '/app', '/app/', '/?page=welcome']) {
  const response = await page.goto(`http://127.0.0.1:5174${route}`)
  expect(response.status()).toBe(200)
  await expect(page.getByRole('heading', {level:1})).toHaveText(route.startsWith('/app') ? 'Tus almacenes' : 'Diseña tu almacén en 3D.')
  await page.reload()
  await expect(page.getByRole('heading', {level:1})).toBeVisible()
 }
 console.log('Production routes and reloads passed')
} finally { await browser.close() }

