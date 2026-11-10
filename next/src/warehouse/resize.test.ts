import { describe, expect, it } from 'vitest'
import { addRack, createWarehouse, validateDocument, type WarehouseDocument } from './document'
import { resizeDelta, resizeWarehouse } from './resize'

function sample(): WarehouseDocument {
  const doc = addRack(createWarehouse())
  doc.zones.push({ id: 'zone', kind: 'zone', code: 'Z', name: 'Suelo', color: '#123456', xMm: 500, yMm: 500, widthMm: 9000, depthMm: 4000, rotation: 0 })
  doc.fixtures.push({ id: 'table', kind: 'table', code: 'M', name: 'Mesa', color: '#123456', xMm: 10000, yMm: 6000, widthMm: 2000, depthMm: 1000, heightMm: 900, rotation: 90 })
  return doc
}

describe('redimensionar desde los cuatro bordes', () => {
  it.each(['left', 'right', 'top', 'bottom'] as const)('amplía %s sin mutar el original ni perder identidades', edge => {
    const doc = sample(), before = structuredClone(doc)
    const next = resizeWarehouse(doc, edge, 1700, 1000)
    const horizontal = edge === 'left' || edge === 'right'
    expect(next.widthMm).toBe(doc.widthMm + (horizontal ? 2000 : 0))
    expect(next.depthMm).toBe(doc.depthMm + (horizontal ? 0 : 2000))
    for (const key of ['racks', 'zones', 'fixtures'] as const) {
      expect(next[key][0]).toMatchObject({ id: doc[key][0].id, code: doc[key][0].code, xMm: doc[key][0].xMm + (edge === 'left' ? 2000 : 0), yMm: doc[key][0].yMm + (edge === 'top' ? 2000 : 0) })
    }
    expect(validateDocument(next)).toEqual([])
    expect(doc).toEqual(before)
  })
  it('reduce conservando todo el contenido y deja deshacer por instantánea', () => {
    const doc = sample()
    const expanded = resizeWarehouse(doc, 'left', 3000, 1000)
    expect(resizeWarehouse(expanded, 'left', -3000, 1000)).toEqual(doc)
    expect(resizeWarehouse(doc, 'right', -1000, 1000).widthMm).toBe(31000)
    expect(resizeWarehouse(doc, 'bottom', -1000, 1000).depthMm).toBe(33000)
  })
  it('rechaza recortar contenido en cualquiera de los lados', () => {
    const doc = sample()
    expect(() => resizeWarehouse(doc, 'left', -1000, 1000)).toThrow(/fuera|recortar/)
    expect(() => resizeWarehouse(doc, 'top', -1000, 1000)).toThrow(/fuera|recortar/)
    expect(() => resizeWarehouse(doc, 'right', -22000, 1000)).toThrow(/fuera|recortar/)
    expect(() => resizeWarehouse(doc, 'bottom', -29000, 1000)).toThrow(/fuera|recortar/)
  })
  it('redondea deltas simétricamente y conserva referencia si no cambia nada', () => {
    const doc = sample()
    expect(resizeDelta(500, 1000)).toBe(1000)
    expect(resizeDelta(-500, 1000)).toBe(-1000)
    expect(resizeWarehouse(doc, 'left', 499, 1000)).toBe(doc)
    expect(resizeWarehouse(doc, 'right', 0, 1000)).toBe(doc)
  })
  it('comprueba límites y entradas antes de construir el documento', () => {
    const doc = sample()
    for (const grid of [0, -1, .5, NaN, Infinity]) expect(() => resizeWarehouse(doc, 'right', 1000, grid)).toThrow()
    for (const delta of [NaN, Infinity, 1e12, -32000]) expect(() => resizeWarehouse(doc, 'right', delta, 1000)).toThrow()
    expect(() => resizeWarehouse(doc, 'wrong' as never, 1000, 1000)).toThrow()
  })
})
