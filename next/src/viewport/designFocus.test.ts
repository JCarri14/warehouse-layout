import { expect, it } from 'vitest'
import { createWarehouse, exampleWarehouse } from '../warehouse/document'
import { designFocusIds } from './designFocus'

it('sin selección no atenúa y una estantería conserva solo su selección', () => {
  const doc = exampleWarehouse(), rack = doc.racks[0]
  expect(designFocusIds(doc, null)).toBeNull()
  expect(designFocusIds(doc, 'missing')).toBeNull()
  expect([...designFocusIds(doc, rack.id)!]).toEqual([rack.id])
})
it('la zona mantiene referencias interiores y cruzadas, con huellas giradas, sin incluir elementos exteriores', () => {
  const doc = createWarehouse(), base = exampleWarehouse().racks[0]
  doc.zones = [{ kind: 'zone', id: 'zone', code: 'Z', name: '', color: '#337b78', xMm: 1000, yMm: 1000, widthMm: 6000, depthMm: 4000, rotation: 0 }]
  doc.racks = [
    { ...base, id: 'inside', xMm: 2000, yMm: 2000, widthMm: 1000, depthMm: 1000 },
    { ...base, id: 'crossing', xMm: 6500, yMm: 2000, widthMm: 2000, depthMm: 1000 },
    { ...base, id: 'turned', xMm: 6000, yMm: 2000, widthMm: 1000, depthMm: 2000, rotation: 90 },
    { ...base, id: 'outside', xMm: 8000, yMm: 2000, widthMm: 1000, depthMm: 1000 },
    { ...base, id: 'touching', xMm: 7000, yMm: 2000, widthMm: 1000, depthMm: 1000 },
  ]
  doc.fixtures = [{ kind: 'table', id: 'table', code: 'M', name: '', color: '#337b78', xMm: 2000, yMm: 3500, widthMm: 1000, depthMm: 1000, heightMm: 1000, rotation: 0 }]
  expect([...designFocusIds(doc, 'zone')!].sort()).toEqual(['crossing', 'inside', 'table', 'turned', 'zone'])
})
