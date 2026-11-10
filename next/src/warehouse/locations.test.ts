import { describe, expect, it } from 'vitest'
import { addRack, createWarehouse, validateDocument } from './document'
import { accessFace, columnAccess, compileLocationFormat, locationsForLevel, resolveLocation } from './locations'
import { decode, encode } from '../persistence/documentCodec'

describe('formato de ubicaciones', () => {
  it('compone y lee el formato actual sección/nivel/columna', () => {
    const format = compileLocationFormat('{S}{N}{C}')
    expect(format.compose('A5', '01', '10')).toBe('A50110')
    expect(format.parse(' a50110 ')).toEqual({ section: 'A5', level: '01', column: '10' })
    expect(format.parse('A5110')).toBeNull()
  })
  it('reordena campos y admite cifras cortas cuando hay separadores', () => {
    const format = compileLocationFormat('{C}/{S}/{N}')
    expect(format.compose('A5', '2', '1')).toBe('01/A5/02')
    expect(format.parse('1/a5/2')).toEqual({ section: 'A5', level: '02', column: '01' })
  })
  it('conserva marcadores separados, comodines y texto literal sin interpretarlo como regex', () => {
    const format = compileLocationFormat('{*}{L}-{E}/({N})+{C}{*}')
    expect(format.compose('A5', '01', '10')).toBe('A-5/(01)+10')
    expect(format.parse('ERP:A-5/(1)+10 FIN')).toEqual({ section: 'A5', level: '01', column: '10' })
    expect(compileLocationFormat('erp-{S}.{N}.{C}').compose('A5', '01', '10')).toBe('ERP-A5.01.10')
  })
  it('rechaza plantillas incompletas, repetidas, mixtas, mal cerradas o excesivas', () => {
    for (const source of ['{S}{C}', '{S}{N}{N}{C}', '{S}{L}{E}{N}{C}', '{R}{N}{C}', '{S}{N}{C}}', '{S}{N}{C', '{L}{N}{C}', '{S}\n{N}{C}', 'x'.repeat(121)]) expect(() => compileLocationFormat(source)).toThrow()
    expect(compileLocationFormat('').source).toBe('{S}{N}{C}')
    expect(() => compileLocationFormat('{S}{N}{C}').compose('AA', '01', '01')).toThrow()
  })
  it('acota la lectura de comodines y no acepta códigos de longitud arbitraria', () => {
    const format = compileLocationFormat('{*}'.repeat(30) + '{S}{N}{C}')
    expect(format.parse('X'.repeat(256))).toBeNull()
    expect(format.parse('X'.repeat(257))).toBeNull()
  })
  it('conserva los ejemplos de ERP y los casos de referencia de la aplicación Windows', () => {
    const samples = [
      ['{S}{N}{C}', 'A20103', 'A2', '01', '03'],
      ['{S}{N}{C}', 'E10204', 'E1', '02', '04'],
      ['{L}-{E}-{N}-{C}', 'A-5-1-1', 'A5', '01', '01'],
      ['{*}-{S}-{N}-{C}', 'CENTRAL-A5-01-10', 'A5', '01', '10'],
      ['{S}{N}{C}-{*}', 'A50110-LOTE7', 'A5', '01', '10'],
      ['{C}.{N}.{L}{E}', '10.01.A5', 'A5', '01', '10'],
      ['EST {S} NIV {N} COL {C}', 'EST B7 NIV 03 COL 42', 'B7', '03', '42'],
    ]
    for (const [template, code, section, level, column] of samples) {
      const format = compileLocationFormat(template)
      expect(format.parse(code)).toEqual({ section, level, column })
      expect(format.parse(format.compose(section, level, column))).toEqual({ section, level, column })
    }
  })
})

describe('geometría e identidad de ubicaciones', () => {
  it('distribuye columnas en el acceso y cambia solo su sentido al invertir', () => {
    const rack = addRack(createWarehouse()).racks[0]
    expect(columnAccess(rack, 1)).toMatchObject({ xMm: 2000, yMm: 2200, normalX: 0, normalY: 1 })
    expect(columnAccess({ ...rack, reverse: true }, 1)).toMatchObject({ xMm: 6000, yMm: 2200 })
    expect(columnAccess({ ...rack, rotation: 90 }, 1)).toMatchObject({ xMm: 1000, yMm: 2000, normalX: -1, normalY: 0 })
    expect(() => columnAccess(rack, 0)).toThrow()
    expect(() => columnAccess(rack, 4)).toThrow()
  })
  it('mantiene las cuatro caras y sus normales en los cuatro giros', () => {
    const rack = addRack(createWarehouse()).racks[0]
    for (const rotation of [0, 90, 180, 270] as const) for (const access of ['front', 'back', 'left', 'right'] as const) {
      const r = { ...rack, rotation, access }, point = columnAccess(r, 2), face = accessFace(r)
      const w = rotation % 180 ? rack.depthMm : rack.widthMm, d = rotation % 180 ? rack.widthMm : rack.depthMm
      expect(point.xMm).toBeGreaterThanOrEqual(r.xMm); expect(point.xMm).toBeLessThanOrEqual(r.xMm + w)
      expect(point.yMm).toBeGreaterThanOrEqual(r.yMm); expect(point.yMm).toBeLessThanOrEqual(r.yMm + d)
      expect(Math.abs(point.normalX) + Math.abs(point.normalY)).toBe(1)
      expect((face.end.xMm - face.start.xMm) * point.normalX + (face.end.yMm - face.start.yMm) * point.normalY).toBeCloseTo(0)
    }
  })
  it('genera solo ubicaciones de niveles reales y localiza la columna y cota correctas', () => {
    const doc = addRack(createWarehouse()), rack = doc.racks[0]
    expect(locationsForLevel(doc, rack, '01').map(l => l.code)).toEqual(['A00101', 'A00102', 'A00103'])
    const result = resolveLocation(doc, 'A00102')
    expect(result).toMatchObject({ ok: true, rackId: rack.id, parts: { section: 'A0', level: '01', column: '02' }, elevationMm: 1400, point: { xMm: 4000, yMm: 2200 } })
    rack.levels = []
    expect(locationsForLevel(doc, rack, '00')).toEqual([])
    expect(resolveLocation(doc, 'A00001')).toMatchObject({ ok: false, reason: 'level' })
  })
  it('distingue códigos mal formados, secciones, niveles y columnas desconocidos', () => {
    const doc = addRack(createWarehouse())
    expect(resolveLocation(doc, 'incorrecto')).toMatchObject({ ok: false, reason: 'format' })
    expect(resolveLocation(doc, 'B00101')).toMatchObject({ ok: false, reason: 'section' })
    expect(resolveLocation(doc, 'A09901')).toMatchObject({ ok: false, reason: 'level' })
    expect(resolveLocation(doc, 'A00100')).toMatchObject({ ok: false, reason: 'column' })
    expect(resolveLocation(doc, 'A00104')).toMatchObject({ ok: false, reason: 'column' })
  })
  it('guarda versión 3, migra versiones web 1 y 2 y valida el formato al abrir', () => {
    const doc = addRack(createWarehouse())
    doc.locationTemplate = '{S}-{N}-{C}'
    expect(doc.version).toBe(4); expect(decode(encode(doc))).toEqual(doc)
    const { locationTemplate: _template, gridSizeMm: _grid, ...v2 } = doc
    const old2 = { ...v2, version: 2 }
    expect(decode(JSON.stringify(old2))).toMatchObject({ version: 4, gridSizeMm: 1000, locationTemplate: '{S}{N}{C}', racks: doc.racks })
    const { zones: _zones, fixtures: _fixtures, ...v1 } = old2
    expect(decode(JSON.stringify({ ...v1, version: 1 })).version).toBe(4)
    expect(validateDocument({ ...doc, locationTemplate: '{S}{C}' }).length).toBeGreaterThan(0)
    expect(() => decode(JSON.stringify({ ...doc, version: 2 }))).toThrow()
  })
})
