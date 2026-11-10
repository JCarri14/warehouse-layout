import { chromium } from '@playwright/test'
const browser = await chromium.launch()
try {
 const page = await browser.newPage({viewport:{width:390,height:900}})
 await page.goto('http://127.0.0.1:5173/')
 await page.locator('.landing-local').scrollIntoViewIfNeeded()
 await page.screenshot({path:'artifacts/landing-mobile-bottom.png'})
 if (await page.locator('.landing-page').evaluate(el=>el.scrollWidth>el.clientWidth)) throw new Error('Horizontal overflow')
 await page.setViewportSize({width:1440,height:900})
 await page.locator('.landing-local').scrollIntoViewIfNeeded()
 await page.screenshot({path:'artifacts/landing-desktop-bottom.png'})
} finally {await browser.close()}

