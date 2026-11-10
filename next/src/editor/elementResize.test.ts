import { describe, expect, it } from 'vitest'
import { addRack, allElements, createWarehouse, footprint, type WarehouseDocument } from '../warehouse/document'
import { addElement, moveElement } from './commands'
import { resizeElement } from './elementResize'
import { decode, encode } from '../persistence/documentCodec'

describe('redimensionar desde los lados visibles', () => {
  const fixture = () => addRack(createWarehouse())
  it('fija el borde opuesto y no altera ubicaciones ni altura', () => {
    const doc = fixture(), rack = doc.racks[0]
    const next = resizeElement(doc, rack.id, 'left', 1000, 1000)
    expect(next.racks[0]).toEqual({ ...rack, xMm: 0, widthMm: 7000 })
    expect(doc.racks[0]).toEqual(rack)
    expect(resizeElement(doc, rack.id, 'bottom', 1000, 1000).racks[0]).toEqual({ ...rack, depthMm: 2200 })
  })
  it('redimensiona la huella de una estantería girada, con o sin ajuste', () => {
    const doc = fixture(); doc.racks[0].rotation = 90
    const rack = doc.racks[0], next = resizeElement(doc, rack.id, 'right', 600, 1000)
    expect(next.racks[0]).toEqual({ ...rack, depthMm: 2200 })
    expect(footprint(next.racks[0]).w).toBe(2200)
    expect(resizeElement(doc, rack.id, 'top', 123, 0).racks[0]).toMatchObject({ yMm: 877, widthMm: 6123 })
  })
  it('rechaza salir del plano, tamaños nulos y colisiones físicas', () => {
    const doc = addElement(fixture(), 'table'), rack = doc.racks[0]
    expect(() => resizeElement(doc, rack.id, 'left', 2000, 1000)).toThrow()
    expect(() => resizeElement(doc, rack.id, 'right', -6000, 1000)).toThrow()
    const table = doc.fixtures[0]
    const near: WarehouseDocument = { ...doc, fixtures: [{ ...table, xMm: 8000, yMm: rack.yMm }] }
    expect(() => resizeElement(near, rack.id, 'right', 2000, 1000)).toThrow(/solapan/)
  })
  it('superpone zonas y guarda ambas sin mover ni escalar su contenido', () => {
    let doc = addElement(addElement(fixture(), 'zone'), 'zone')
    const first = doc.zones[0], second = doc.zones[1]
    doc = moveElement(doc, second.id, first.xMm + 1000, first.yMm + 1000)
    const next = resizeElement(doc, first.id, 'right', 3000, 1000)
    expect(next.zones[1]).toEqual(doc.zones[1])
    expect(next.racks).toEqual(doc.racks)
    expect(decode(encode(next))).toEqual(next)
  })
  it('permite crear zonas si solo queda espacio superpuesto', () => {
    const doc = { ...createWarehouse(), widthMm: 8000, depthMm: 6000 }
    const next = addElement(addElement(doc, 'zone'), 'zone')
    expect(next.zones).toHaveLength(2)
    expect(next.zones.map(zone => [zone.xMm, zone.yMm])).toEqual([[0, 0], [0, 0]])
    expect(decode(encode(next))).toEqual(next)
  })
  it('aplica las mismas reglas a mesas, obstáculos y zonas', () => {
    for (const kind of ['table', 'obstacle', 'zone'] as const) {
      const doc = addElement(createWarehouse(), kind), element = allElements(doc)[0]
      const next = resizeElement(doc, element.id, 'bottom', 500, 0)
      expect(allElements(next)[0]).toEqual({ ...element, depthMm: element.depthMm + 500 })
    }
  })
})
