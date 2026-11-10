import { describe, expect, it } from 'vitest'
import { createWarehouse, type Rack, type WarehouseDocument } from '../warehouse/document'
import { calculateRoute, defaultRouteSettings, pointIsFree, validateRouteSettings } from './routing'
import type { DataLine, RouteSettings } from './types'
const warehouse = (): WarehouseDocument => ({ ...createWarehouse(), widthMm: 3000, depthMm: 3000 })
const settings: RouteSettings = { start: { xMm: 250, yMm: 250 }, end: { xMm: 2750, yMm: 250 }, returnToStart: false, cellSizeMm: 500 }
const rack = (extra: Partial<Rack> = {}): Rack => ({ id: 'rack', code: 'A1', alias: '', color: '#123456', xMm: 1000, yMm: 1000, widthMm: 1000, depthMm: 500, heightMm: 2000, rotation: 0, columns: 2, access: 'front', reverse: false, levels: [{ id: 'l0', code: '00', elevationMm: 0 }, { id: 'l1', code: '01', elevationMm: 1000 }], ...extra })
const line = (location = 'A10001', id = 'one'): DataLine => ({ id, location, quantity: 1, origin: 'Pedido', reference: 'ref', description: 'Pieza' })
describe('rutas físicas', () => {
  it('mide los extremos y las celdas parciales en milímetros', () => {
    const doc = { ...warehouse(), widthMm: 2800 }
    const result = calculateRoute(doc, [], { ...settings, end: { xMm: 2700, yMm: 250 } })
    expect(result.distanceMm).toBe(2450)
    expect(result.path.at(-1)).toEqual({ xMm: 2700, yMm: 250 })
    expect(calculateRoute(doc, [], { ...settings, returnToStart: true }).distanceMm).toBe(0)
  })
  it('ignora zonas y bloquea paredes finas sin atravesarlas', () => {
    const doc = warehouse()
    doc.zones = [{ id: 'zone', code: 'Z', name: 'Zona', color: '#123456', kind: 'zone', xMm: 1000, yMm: 0, widthMm: 10, depthMm: 3000, rotation: 0 }]
    expect(calculateRoute(doc, [], settings).distanceMm).toBe(2500)
    doc.fixtures = [{ ...doc.zones[0], kind: 'obstacle', heightMm: 2000 }]
    expect(() => calculateRoute(doc, [], settings)).toThrow(/acceso|alcanz|pasillo/i)
  })
  it('preserva todas las líneas y niveles del mismo punto sin mutar entradas', () => {
    const doc = warehouse(); doc.racks = [rack()]
    const lines = [line(), line('A10101', 'two')]
    const before = JSON.stringify({ doc, lines })
    const result = calculateRoute(doc, lines, settings)
    expect(result.stops).toHaveLength(1)
    expect(result.stops[0].lines).toEqual(lines)
    expect(result.stops[0].rackIds).toEqual(['rack'])
    expect(result.exact).toBe(true)
    expect(JSON.stringify({ doc, lines })).toBe(before)
  })
  it('respeta el giro y el orden inverso de columnas', () => {
    const doc = warehouse(); doc.racks = [rack({ rotation: 90, reverse: true })]
    const result = calculateRoute(doc, [line()], settings)
    expect(result.stops[0].point).toEqual({ xMm: 750, yMm: 1750 })
  })
  it('rechaza accesos tapados sin cambiar de cara', () => {
    const doc = warehouse(); doc.racks = [rack()]
    doc.fixtures = [{ id: 'wall', code: 'W', name: 'Pared', color: '#123456', kind: 'obstacle', heightMm: 2000, xMm: 1000, yMm: 1500, widthMm: 1000, depthMm: 20, rotation: 0 }]
    expect(() => calculateRoute(doc, [line()], settings)).toThrow(/acceso/i)
  })
  it('valida cantidades, ubicaciones, puntos y el límite de malla', () => {
    const doc = warehouse(); doc.racks = [rack()]
    expect(() => calculateRoute(doc, [{ ...line(), quantity: 0 }], settings)).toThrow(/cantidad/i)
    expect(() => calculateRoute(doc, [line('A19901')], settings)).toThrow(/nivel/i)
    expect(() => calculateRoute(doc, [], { ...settings, start: { xMm: 1100, yMm: 1100 } })).toThrow(/inicio/i)
    expect(() => calculateRoute(doc, [], { ...settings, cellSizeMm: 1 })).toThrow(/160.000/)
    expect(validateRouteSettings({ ...settings, end: { xMm: NaN, yMm: 0 } })).toBe(false)
    expect(pointIsFree(doc, { xMm: -1, yMm: 0 })).toBe(false)
    expect(pointIsFree(doc, defaultRouteSettings(doc).start)).toBe(true)
  })
  it('rechaza un extremo en la parte libre de una celda ocupada', () => {
    const doc = warehouse(); doc.racks = [rack({ xMm: 1100, widthMm: 100 })]
    expect(() => calculateRoute(doc, [], { ...settings, start: { xMm: 1050, yMm: 1250 } })).toThrow(/celda/i)
  })
  it('optimiza el orden exacto y calcula el retorno y las distancias acumuladas', () => {
    const doc = warehouse(); doc.racks = [rack()]
    const lines = [line('A10002', 'two'), line()]
    const open = calculateRoute(doc, lines, settings)
    expect(open.stops.map(s => s.lines[0].location)).toEqual(['A10001', 'A10002'])
    expect(open.distanceMm).toBe(5500)
    expect(open.stops.map(s => s.distanceMm)).toEqual([2500, 3000])
    const closed = calculateRoute(doc, lines, { ...settings, returnToStart: true })
    expect(closed.distanceMm).toBe(6000)
    expect(closed.path.at(-1)).toEqual(settings.start)
    for (const result of [open, closed]) {
      const measured = result.path.slice(1).reduce((total, point, index) => total + Math.hypot(point.xMm - result.path[index].xMm, point.yMm - result.path[index].yMm), 0)
      expect(result.distanceMm).toBe(measured)
    }
  })
  it('marca como aproximadas las rutas con más de 16 paradas y es repetible', () => {
    const doc = { ...warehouse(), widthMm: 12000 }
    doc.racks = [rack({ widthMm: 8500, columns: 17 })]
    const lines = Array.from({ length: 17 }, (_, i) => line(`A100${String(i + 1).padStart(2, '0')}`, String(i)))
    const a = calculateRoute(doc, lines, settings), b = calculateRoute(doc, lines, settings)
    expect(a.stops).toHaveLength(17)
    expect(a.exact).toBe(false)
    expect(a.warnings.join(' ')).toMatch(/aproximado/)
    expect(a).toEqual(b)
  })
})
