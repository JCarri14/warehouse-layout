const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function siteOrigin(value = '') {
 if (!value) return ''
 const url = new URL(value)
 if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('SITE_URL must be an HTTPS origin, e.g. https://example.com')
 return url.origin
}
export function metadata(path, origin = '') {
 const en = path === '/en/'
 const publicPage = path === '/' || en
 const title = publicPage ? (en ? '3D warehouse layout planner | Warehouse Layout' : 'Diseño de almacenes en 3D | Warehouse Layout') : 'Warehouse Layout'
 const description = en ? 'Design warehouse layouts in 2D and 3D, locate imported inventory and plan picking routes. Explore an example in your browser with local files.' : 'Diseña almacenes en 2D y 3D, localiza inventario importado y planifica recorridos de recogida. Prueba un ejemplo en tu navegador con archivos locales.'
 const tags = [`<title>${escape(title)}</title>`, `<meta name="robots" content="${publicPage && origin ? 'index,follow' : 'noindex,follow'}">`]
 if (!publicPage) return tags.join('\n')
 tags.push(`<meta name="description" content="${escape(description)}">`, `<meta property="og:title" content="${escape(title)}">`, `<meta property="og:description" content="${escape(description)}">`, '<meta property="og:type" content="website">', `<meta property="og:locale" content="${en ? 'en_GB' : 'es_ES'}">`, '<meta name="twitter:card" content="summary_large_image">')
 if (origin) {
  const url = origin + path
  tags.push(`<link rel="canonical" href="${url}">`, `<link rel="alternate" hreflang="es" href="${origin}/">`, `<link rel="alternate" hreflang="en" href="${origin}/en/">`, `<link rel="alternate" hreflang="x-default" href="${origin}/">`, `<meta property="og:url" content="${url}">`, `<meta property="og:image" content="${origin}/landing/editor${en ? '-en' : ''}.png">`)
  const graph = {'@context':'https://schema.org','@graph':[
   {'@type':'WebSite','@id':origin+'/#website',name:'Warehouse Layout',url:origin+'/',inLanguage:['es','en']},
   {'@type':'WebApplication','@id':origin+'/#application',name:'Warehouse Layout',url:origin+'/app',applicationCategory:'BusinessApplication',operatingSystem:'Web',browserRequirements:'JavaScript and WebGL',inLanguage:['es','en'],description,featureList:en?['2D and 3D warehouse design','Imported inventory lookup','Picking route planning']:['Diseño de almacenes 2D y 3D','Consulta de inventario importado','Planificación de recorridos de recogida'],screenshot:origin+`/landing/editor${en?'-en':''}.png`},
   {'@type':'WebPage','@id':url+'#page',url,name:title,description,inLanguage:en?'en':'es',isPartOf:{'@id':origin+'/#website'},about:{'@id':origin+'/#application'}}
  ]}
  tags.push(`<script type="application/ld+json">${JSON.stringify(graph).replace(/</g,'\\u003c')}</script>`)
 }
 return tags.join('\n')
}
export function decorate(html, path, origin, body) {
 return html.replace(/<html lang="[^"]*"/, `<html lang="${path === '/en/' ? 'en' : 'es'}"`).replace(/<title>.*?<\/title>/s, metadata(path, origin)).replace('<div id="root"></div>', `<div id="root">${body ?? ''}</div>`)
}
export const notFound = '<main style="padding:48px;font-family:system-ui"><h1>404</h1><p>Página no encontrada · Page not found</p><a href="/">Warehouse Layout</a></main>'
