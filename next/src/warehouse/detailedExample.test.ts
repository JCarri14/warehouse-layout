import { expect, it } from 'vitest'
import { detailedExampleWarehouse } from './detailedExample'
import { footprint, validateDocument } from './document'
it('el ejemplo compacto conserva ubicaciones y muestra todas las estanterías con contenido', () => {
 const doc = detailedExampleWarehouse()
 expect(validateDocument(doc)).toEqual([])
 expect([doc.widthMm,doc.depthMm,doc.racks.length,doc.zones.length]).toEqual([22000,34000,22,3])
 expect(new Set(doc.racks.map(rack=>rack.contents))).toEqual(new Set(['pallets','bins','cartons']))
 for(const rack of doc.racks){
  expect(rack.heightMm).toBeNull()
  expect(rack.levels).toEqual([])
  expect(rack.columns).toBe(10)
  const a=footprint(rack)
  expect(a.x+a.w).toBeLessThanOrEqual(21000)
  expect(a.y+a.d).toBeLessThanOrEqual(30000)
  for(const other of doc.racks.filter(item=>item.id!==rack.id)){
   const b=footprint(other)
   expect(a.x < b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.d && a.y+a.d>b.y).toBe(false)
  }
 }
 const first=footprint(doc.racks.find(r=>r.code==='E1')!)
 const second=footprint(doc.racks.find(r=>r.code==='E2')!)
 expect(second.x-(first.x+first.w)).toBe(3000)
 for(const zone of doc.zones.filter(z=>z.code!=='ALM')){
  expect(zone.yMm).toBe(30000)
  expect(zone.yMm+zone.depthMm).toBe(doc.depthMm)
 }
 expect(doc.fixtures[0]).toMatchObject({xMm:21000,yMm:0,widthMm:1000,depthMm:34000})
 doc.racks[0].alias='Changed'
 expect(detailedExampleWarehouse().racks[0].alias).toBe('')
})
