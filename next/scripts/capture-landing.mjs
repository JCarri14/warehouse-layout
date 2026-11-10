import { chromium, expect } from '@playwright/test'
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto('http://127.0.0.1:5173/app')
  await page.getByRole('button', { name: 'Abrir ejemplo detallado', exact: true }).click()
  await page.locator('.canvas-panel canvas').waitFor()
  await page.getByRole('button', { name: /^Plano general/ }).click()
  await expect(page.locator('.element-row')).toHaveCount(26)
  await expect(page.locator('.element-row.active')).toHaveCount(0)
  await expect(page.getByLabel('Mostrar elementos', { exact: true })).toHaveValue('')
  await page.mouse.move(1400, 890)
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'public/landing/editor.png' })
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await page.getByLabel('Idioma', { exact: true }).selectOption('en')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByLabel('Show elements', { exact: true })).toHaveValue('')
  await page.mouse.move(1400, 890)
  await page.screenshot({ path: 'public/landing/editor-en.png' })
} finally { await browser.close() }


