import { describe, expect, it } from 'vitest'
import { addRack, createWarehouse, metres, parseMetres, validateDocument, type WarehouseDocument } from './document'
import { decode, encode } from '../persistence/documentCodec'

describe('almacén y archivos locales', () => {
  it('interpreta metros sin perder precisión', () => {
    expect(parseMetres('1,235')).toBe(1235)
    expect(parseMetres('2.4')).toBe(2400)
    expect(parseMetres(metres(1000000))).toBe(1000000)
    expect(() => parseMetres('1.0001')).toThrow()
    expect(() => parseMetres('')).toThrow()
  })
  it('crea estanterías con identidad y códigos únicos sin colisiones', () => {
    const doc = addRack(addRack(createWarehouse()))
    expect(doc.racks).toHaveLength(2)
    expect(doc.racks[0].id).not.toBe(doc.racks[1].id)
    expect(doc.racks[0].code).not.toBe(doc.racks[1].code)
    expect(validateDocument(doc)).toEqual([])
  })
  it('permite bordes compartidos y rechaza intersecciones y giros fuera del suelo', () => {
    const doc = addRack(addRack(createWarehouse()))
    doc.racks[1].xMm = doc.racks[0].xMm + doc.racks[0].widthMm
    doc.racks[1].yMm = doc.racks[0].yMm
    expect(validateDocument(doc)).toEqual([])
    doc.racks[1].xMm -= 1
    expect(validateDocument(doc).join(' ')).toMatch(/solapan/)
    doc.racks[1].xMm = doc.widthMm - doc.racks[1].widthMm
    doc.racks[1].rotation = 90
    doc.racks[1].yMm = doc.depthMm - 100
    expect(validateDocument(doc).join(' ')).toMatch(/fuera/)
  })
  it('valida alturas, niveles, códigos e identificadores', () => {
    const doc = addRack(createWarehouse())
    const rack = doc.racks[0]
    rack.levels = [{ id: 'l1', code: '00', elevationMm: 0 }, { id: 'l2', code: '01', elevationMm: 8000 }]
    expect(validateDocument(doc).join(' ')).toMatch(/altura/)
    rack.levels[1].elevationMm = 0
    expect(validateDocument(doc).join(' ')).toMatch(/cotas/)
    rack.levels = []
    doc.racks.push({ ...rack })
    expect(validateDocument(doc).join(' ')).toMatch(/identificadores/)
    expect(validateDocument(doc).join(' ')).toMatch(/códigos/)
  })
  it('recupera exactamente el documento y rechaza archivos externos inválidos', () => {
    const doc = addRack(createWarehouse())
    expect(decode(encode(doc))).toEqual(doc)
    expect(() => decode('{')).toThrow(/JSON/)
    expect(() => decode('{"Width":32}')).toThrow(/anterior|formato/)
    expect(() => decode(JSON.stringify({ ...doc, version: 99 }))).toThrow(/versión/)
    expect(() => decode(JSON.stringify({ ...doc, widthMm: -1 }))).toThrow()
    expect(() => decode(JSON.stringify({ ...doc, racks: [null] }))).toThrow()
    expect(() => decode(JSON.stringify({ ...doc, widthMm: null }))).toThrow()
  })
  it('rechaza geometría no finita y documento desconocido', () => {
    const doc = createWarehouse()
    doc.widthMm = NaN
    expect(validateDocument(doc).length).toBeGreaterThan(0)
    expect(validateDocument({} as WarehouseDocument).length).toBeGreaterThan(0)
  })
})
