import { test as base } from '@playwright/test'
// Existing file tests exercise the download fallback; dedicated tests install native-picker doubles.
export const test = base.extend({ page: async ({ page }, provide) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, writable: true, value: undefined })
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, writable: true, value: undefined })
  })
  // Existing suites exercise the editor. Start-screen flows use the base fixture.
  const goto = page.goto.bind(page), reload = page.reload.bind(page)
  const enterEditor = async () => {
    await page.locator('.app-header').waitFor()
    await page.locator('.recovery-loading').waitFor({ state: 'hidden' })
    if (await page.getByRole('dialog').isVisible()) return
    const resume = page.getByRole('button', { name: /Seguir con el plano actual|Continue with the current plan/ })
    if (await resume.isVisible()) await resume.click()
  }
  page.goto = async (...args) => { const response = await goto(...args); await enterEditor(); return response }
  page.reload = async (...args) => { const response = await reload(...args); await enterEditor(); return response }
  await provide(page)
} })
