import fs from 'node:fs/promises'
import { decorate, siteOrigin, notFound } from './metadata.mjs'
export function seoPlugin() {
 let devServer
 const origin=siteOrigin(process.env.SITE_URL)
 const redirect=(req,res,next)=>{
  const url=new URL(req.url,'http://localhost')
  if(url.searchParams.get('page')==='welcome'||url.pathname==='/en'||url.pathname==='/app/'){
   url.pathname=url.searchParams.get('page')==='welcome'?'/':url.pathname==='/en'?'/en/':'/app'
   url.searchParams.delete('page')
   res.writeHead(301,{Location:url.pathname+url.search});res.end();return
  }
  next()
 }
 return {
  name:'warehouse-public-pages',
  configureServer(server){
   devServer=server
   server.middlewares.use(redirect)
   server.middlewares.use((req,res,next)=>{
    const path=new URL(req.url,'http://localhost').pathname
    if(['/','/en/','/app'].includes(path)||/^\/(src|node_modules|@|assets|branding|landing)/.test(path)) return next()
    if(path==='/robots.txt'){res.setHeader('Content-Type','text/plain');res.end('User-agent: *\nAllow: /\n');return}
    if(path==='/sitemap.xml'){res.setHeader('Content-Type','application/xml');res.end('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>');return}
    res.statusCode=404;res.setHeader('Content-Type','text/html');res.end(notFound)
   })
  },
  transformIndexHtml:{order:'pre',async handler(html,ctx){
   if(!ctx.server) return html
   const path=new URL(ctx.originalUrl??ctx.path,'http://localhost').pathname
   const publicPage=path==='/'||path==='/en/'
   const body=publicPage?(await devServer.ssrLoadModule('/src/landing/render.tsx')).renderLanding(path==='/en/'?'en':'es'):''
   return decorate(html,path,origin,body)
  }},
  configurePreviewServer(server){
   server.middlewares.use(redirect)
   server.middlewares.use(async(req,res,next)=>{
    const path=new URL(req.url,'http://localhost').pathname
    const file=({'/':'index.html','/en/':'en/index.html','/app':'app/index.html'})[path]
    if(file){res.setHeader('Content-Type','text/html');res.end(await fs.readFile('dist/'+file));return}
    if(/^\/(assets|branding|landing)\//.test(path)||['/robots.txt','/sitemap.xml'].includes(path)) return next()
    res.statusCode=404;res.setHeader('Content-Type','text/html');res.end(await fs.readFile('dist/404.html'))
   })
  }
 }
}
