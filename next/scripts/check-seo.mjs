import assert from 'node:assert/strict'
import { metadata,siteOrigin } from '../seo/metadata.mjs'
const origin='https://warehouse-layout.example'
for(const path of ['/','/en/']) {
 const html=metadata(path,origin)
 assert(html.includes(`rel="canonical" href="${origin}${path}"`))
 assert(html.includes('hreflang="es"')&&html.includes('hreflang="en"'))
 assert(html.includes('content="index,follow"'))
 const data=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])
 assert.equal(data['@graph'].find(node=>node['@type']==='WebApplication').url,origin+'/app')
 assert.equal(data['@graph'].find(node=>node['@type']==='WebPage').inLanguage,path==='/'?'es':'en')
}
assert(metadata('/app',origin).includes('noindex,follow'))
assert(!metadata('/').includes('canonical'))
assert(metadata('/').includes('noindex,follow'))
assert.throws(()=>siteOrigin('http://example.com'))
console.log('SEO metadata and schema checks passed')
