import { describe, expect, it } from 'vitest'
import { addRack, createWarehouse, validateDocument } from './document'
import { addElement, duplicateElement, moveElement, removeElement, rotateElement } from '../editor/commands'
import { decode, encode } from '../persistence/documentCodec'

describe('zonas y elementos físicos', () => {
  it('las zonas pueden contener estanterías y mesas sin ocupar su espacio', () => {
    let doc = addElement(addRack(createWarehouse()), 'zone')
    doc = addElement(doc, 'table')
    expect(doc.zones).toHaveLength(1); expect(doc.fixtures).toHaveLength(1)
    expect(validateDocument(doc)).toEqual([])
    expect(doc.zones[0]).toMatchObject({ xMm: 1000, yMm: 1000 })
    const physical = JSON.stringify([doc.racks, doc.fixtures])
    const moved = moveElement(doc, doc.zones[0].id, 15000, 15000)
    expect(JSON.stringify([moved.racks, moved.fixtures])).toBe(physical)
    expect(moved.zones[0].xMm).toBe(15000)
  })
  it('permite superponer zonas y mantiene códigos y nombres únicos', () => {
    const doc = addElement(addElement(createWarehouse(), 'zone'), 'zone')
    expect(moveElement(doc, doc.zones[1].id, doc.zones[0].xMm, doc.zones[0].yMm).zones).toHaveLength(2)
    doc.zones[1].code = doc.zones[0].code.toLowerCase()
    doc.zones[1].name = doc.zones[0].name.toUpperCase()
    expect(validateDocument(doc).join(' ')).toMatch(/códigos/)
    expect(validateDocument(doc).join(' ')).toMatch(/nombres/)
  })
  it('impide solapamientos entre cualquier elemento físico', () => {
    let doc = addRack(createWarehouse())
    doc = addElement(addElement(doc, 'obstacle'), 'table')
    const [obstacle, table] = doc.fixtures, rack = doc.racks[0]
    expect(() => moveElement(doc, obstacle.id, rack.xMm, rack.yMm)).toThrow(/solapan/)
    expect(() => moveElement(doc, rack.id, table.xMm, table.yMm)).toThrow(/solapan/)
    expect(() => moveElement(doc, table.id, obstacle.xMm, obstacle.yMm)).toThrow(/solapan/)
    expect(validateDocument(doc)).toEqual([])
  })
  it('añadir estanterías también respeta los obstáculos ya existentes', () => {
    const doc = addRack(addElement(createWarehouse(), 'obstacle'))
    expect(validateDocument(doc)).toEqual([])
    expect(doc.racks[0].xMm).not.toBe(doc.fixtures[0].xMm)
  })
  it('reserva códigos de todos los elementos físicos aunque se hayan editado', () => {
    const doc = addElement(createWarehouse(), 'obstacle')
    doc.fixtures[0].code = 'mesa-01'
    const next = addElement(doc, 'table')
    expect(next.fixtures[1].code).toBe('MESA-02')
    expect(validateDocument(next)).toEqual([])
  })
  it('duplicar y girar funcionan para zonas y mesas sin compartir identidad', () => {
    let doc = addElement(addElement(createWarehouse(), 'zone'), 'table')
    const zone = doc.zones[0], table = doc.fixtures[0]
    doc = duplicateElement(doc, zone.id)
    expect(doc.zones[1].id).not.toBe(zone.id); expect(doc.zones[1].name).not.toBe(zone.name)
    doc = duplicateElement(doc, table.id)
    expect(doc.fixtures[1].id).not.toBe(table.id)
    doc = rotateElement(doc, table.id)
    expect(doc.fixtures[0].rotation).toBe(90)
    const without = removeElement(doc, zone.id)
    expect(without.zones).toHaveLength(1); expect(without.fixtures).toHaveLength(2)
  })
  it('rechaza dimensiones, alturas, tipos e identidades inválidas', () => {
    const doc = addElement(addElement(createWarehouse(), 'zone'), 'obstacle')
    doc.zones[0].widthMm = 0; doc.fixtures[0].heightMm = -1
    doc.fixtures[0].id = doc.zones[0].id
    expect(validateDocument(doc).length).toBeGreaterThan(2)
    expect(() => decode(JSON.stringify({ ...doc, fixtures: [null] }))).toThrow()
    expect(() => decode(JSON.stringify({ ...doc, zones: null }))).toThrow()
  })
  it('guarda el formato ampliado y migra la versión web anterior sin perder estanterías', () => {
    const current = addElement(addRack(createWarehouse()), 'zone')
    expect(current.version).toBe(4)
    expect(decode(encode(current))).toEqual(current)
    const { zones: _zones, fixtures: _fixtures, locationTemplate: _template, gridSizeMm: _grid, ...rest } = current
    const migrated = decode(JSON.stringify({ ...rest, version: 1 }))
    expect(migrated).toMatchObject({ version: 4, gridSizeMm: 1000, racks: current.racks, zones: [], fixtures: [] })
    expect(() => decode(JSON.stringify({ ...rest, version: 2 }))).toThrow()
    expect(() => decode(JSON.stringify({ ...current, version: 1 }))).toThrow()
  })
})
