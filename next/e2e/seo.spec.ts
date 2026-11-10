import { test, expect } from '@playwright/test'

test('HTML público sin JavaScript, idiomas enlazados y rutas con estado correcto', async ({ browser, request }) => {
 const context=await browser.newContext({javaScriptEnabled:false})
 const page=await context.newPage()
 for(const [path, heading, language] of [['/','Diseña tu almacén en 3D.','es'],['/en/','Design your warehouse in 3D.','en']]) {
  const response=await page.goto(path)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading',{level:1})).toHaveText(heading)
  await expect(page.locator('html')).toHaveAttribute('lang',language)
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content',/.{80,}/)
  await expect(page.locator('a[hreflang="en"]')).toHaveAttribute('href','/en/')
 }
 await context.close()
 const app=await request.get('/app')
 expect(await app.text()).toContain('noindex,follow')
 const missing=await request.get('/missing-page')
 expect(missing.status()).toBe(404)
 const robots=await request.get('/robots.txt')
 expect(robots.headers()['content-type']).toContain('text/plain')
 expect(await robots.text()).toContain('User-agent: *')
 const sitemap=await request.get('/sitemap.xml')
 expect(sitemap.headers()['content-type']).toContain('xml')
 const old=await request.get('/?page=welcome',{maxRedirects:0})
 expect(old.status()).toBe(301)
 expect(old.headers().location).toBe('/')
})
