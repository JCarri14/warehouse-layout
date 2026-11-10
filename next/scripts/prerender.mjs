import fs from 'node:fs/promises'
import { createServer } from 'vite'
import { decorate, siteOrigin, notFound } from '../seo/metadata.mjs'
const origin = siteOrigin(process.env.SITE_URL)
const template = await fs.readFile('dist/index.html','utf8')
const server = await createServer({ server:{middlewareMode:true}, appType:'custom' })
try {
 const {renderLanding} = await server.ssrLoadModule('/src/landing/render.tsx')
 for (const [path,file] of [['/','dist/index.html'],['/en/','dist/en/index.html'],['/app','dist/app/index.html'],['/404','dist/404.html']]) {
  await fs.mkdir(file.slice(0,file.lastIndexOf('/')),{recursive:true})
  const body = path==='/'||path==='/en/' ? renderLanding(path==='/en/'?'en':'es') : path==='/404'?notFound:''
  await fs.writeFile(file,decorate(template,path,origin,body))
 }
 await fs.writeFile('dist/robots.txt',`User-agent: *\nAllow: /\n${origin ? `Sitemap: ${origin}/sitemap.xml\n` : ''}`)
 await fs.writeFile('dist/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${origin?['/','/en/'].map(path=>`<url><loc>${origin}${path}</loc></url>`).join(''):''}</urlset>`)
 console.log(origin ? `SEO pages generated for ${origin}` : 'Preview build: noindex; set SITE_URL to enable canonical URLs, schema and sitemap entries.')
} finally {await server.close()}
