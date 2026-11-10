import { describe, expect, it } from 'vitest'
import { addRack, createWarehouse, validateDocument } from '../warehouse/document'
import { duplicateRack, moveRack, removeRack, rotateRack, snapCoordinate } from './commands'

describe('comandos atómicos del editor', () => {
  it('mueve y ajusta al paso elegido sin modificar el original', () => {
    const doc = addRack(createWarehouse()), before = JSON.stringify(doc), id = doc.racks[0].id
    const next = moveRack(doc, id, 2349, 3581, 100)
    expect(next.racks[0]).toMatchObject({ xMm: 2300, yMm: 3600 })
    expect(JSON.stringify(doc)).toBe(before)
    expect(snapCoordinate(1234.7, 0)).toBe(1235)
    expect(snapCoordinate(-120, 100)).toBe(-100)
  })
  it('rechaza colisiones y límites al mover o girar', () => {
    const doc = addRack(addRack(createWarehouse())), id = doc.racks[0].id, before = JSON.stringify(doc)
    expect(() => moveRack(doc, id, doc.racks[1].xMm, doc.racks[1].yMm, 0)).toThrow(/solapan/)
    expect(() => moveRack(doc, id, -100, 0, 0)).toThrow()
    doc.racks[0].yMm = doc.depthMm - doc.racks[0].depthMm
    expect(() => rotateRack(doc, id)).toThrow(/fuera/)
    doc.racks[0].yMm = 1000
    expect(JSON.stringify(doc)).toBe(before)
    const rotated = rotateRack(doc, id)
    expect(rotated.racks[0].rotation).toBe(90)
    expect(rotateRack(rotateRack(rotateRack(rotated, id), id), id).racks[0].rotation).toBe(0)
  })
  it('duplica las propiedades con identidad, código y niveles independientes', () => {
    const doc = addRack(createWarehouse()), source = doc.racks[0], next = duplicateRack(doc, source.id)
    const copy = next.racks[1]
    expect(validateDocument(next)).toEqual([])
    expect(copy.id).not.toBe(source.id); expect(copy.code).not.toBe(source.code)
    expect(copy.levels[0].id).not.toBe(source.levels[0].id)
    expect(copy.levels).not.toBe(source.levels)
    expect(copy).toMatchObject({ widthMm: source.widthMm, depthMm: source.depthMm, heightMm: source.heightMm, access: source.access })
    expect(doc.racks).toHaveLength(1)
  })
  it('no duplica si no cabe y elimina solo el elemento solicitado', () => {
    const doc = addRack(createWarehouse()), id = doc.racks[0].id
    doc.widthMm = 6000; doc.depthMm = 1200; doc.racks[0].xMm = 0; doc.racks[0].yMm = 0
    expect(() => duplicateRack(doc, id)).toThrow(/espacio/)
    expect(doc.racks).toHaveLength(1)
    expect(removeRack(doc, id).racks).toHaveLength(0)
    expect(() => removeRack(doc, 'ausente')).toThrow(/existe/)
  })
})
