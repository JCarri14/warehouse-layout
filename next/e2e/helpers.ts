import type { Page } from '@playwright/test'
export async function warehouseAction(page: Page, name: string) {
  await page.getByRole('button', { name: 'Archivo del almacén' }).click()
  await page.getByRole('button', { name, exact: true }).click()
}

export async function changeLanguage(page: Page, language: 'es' | 'en') {
  const settings = page.locator('.measurement-settings>button')
  if (await settings.getAttribute('aria-expanded') !== 'true') await settings.click()
  await page.getByLabel(/^(Idioma|Language)$/).selectOption(language)
  await settings.click()
}
