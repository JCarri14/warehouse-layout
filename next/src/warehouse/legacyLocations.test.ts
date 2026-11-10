import { expect, it } from 'vitest'
import { detailedExampleWarehouse } from './detailedExample'
import { resolveLocation } from './locations'
import { decode } from '../persistence/documentCodec'
it('reconoce A60208 por sección/columna sin inventar su cota, también en descargas anteriores', () => {
  const doc=detailedExampleWarehouse(), {locationPolicy:_policy,...old}=doc
  expect(resolveLocation(doc,'A60208')).toMatchObject({ok:true,elevationMm:null,parts:{section:'A6',level:'02',column:'08'}})
  expect(resolveLocation(decode(JSON.stringify(old)),'A60208')).toMatchObject({ok:true,elevationMm:null})
  expect(resolveLocation({...doc,locationPolicy:'strict'},'A60208')).toMatchObject({ok:false,reason:'level'})
  expect(resolveLocation(doc,'A60211')).toMatchObject({ok:false,reason:'column'})
  expect(resolveLocation(doc,'Z90208')).toMatchObject({ok:false,reason:'section'})
  expect(doc.racks.every(r=>r.levels.length===0)).toBe(true)
})
