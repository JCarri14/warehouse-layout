import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = [], held = [], requests = []
  let release = false
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => requests.push(request.url()))
  await page.route(/\/assets\/(StartRack-|WarehouseViewport-|three\.module-).*\.js/, route => {
    if (release) return route.continue()
    held.push(() => route.continue())
  })
  await page.goto(process.env.STARTUP_PREVIEW_URL ?? 'http://127.0.0.1:5174/app', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Tus almacenes' }).waitFor()
  assert.equal(await page.locator('.viewport canvas').count(), 0)
  await page.screenshot({ path: 'artifacts/inicio-produccion-sin-3d.png' })
  await page.getByRole('button', { name: 'Seguir con el plano actual', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Cargando plano…' }).waitFor()
  release = true
  await Promise.all(held.map(resume => resume()))
  await page.locator('.canvas-panel canvas').waitFor({ state: 'visible' })
  await page.getByRole('button', { name: 'Inventario', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Buscar inventario' }).waitFor()
  assert.deepEqual(errors, [])
  const report = { homeUsableWith3dBlocked: true, editorOpened: true, inventoryOpened: true, errors, requestedScripts: requests.filter(url => url.endsWith('.js')).map(url => new URL(url).pathname) }
  await fs.writeFile('artifacts/startup-browser.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally { await browser.close() }

