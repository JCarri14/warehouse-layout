import { describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { createWarehouse, exampleWarehouse } from '../warehouse/document'
import { buildReport, csvLines, routeCsv } from './reports'
import type { DataLine, RouteResult } from './types'
import { setMeasurementUnit } from '../measurements'

const line: DataLine = { id: 'a', reference: 'P-1', description: 'Tornillo; "inox"\nM8', location: 'A10101', quantity: 2.7, origin: 'OT 1234' }
const route: RouteResult = { path: [{ xMm: 100, yMm: 100 }, { xMm: 200, yMm: 200 }], stops: [{ index: 1, point: { xMm: 200, yMm: 200 }, lines: [line, { ...line, id: 'b', origin: 'OT 2345' }], distanceMm: 1234, rackIds: [] }], distanceMm: 2468, exact: false, cellSizeMm: 100, warnings: [] }
describe('operation reports', () => {
  it('exporta unidades elegidas sin convertir la geometría almacenada', () => {
    const warehouse = exampleWarehouse(), before = JSON.stringify(warehouse)
    setMeasurementUnit('ft')
    try {
      expect(routeCsv(route)).toContain('Distancia (ft)')
      const pdf = buildReport({ warehouse, kind: 'route', name: 'Ruta imperial', lines: [line], route }).output()
      expect(pdf).toContain('ft')
      expect(JSON.stringify(warehouse)).toBe(before)
    } finally { setMeasurementUnit('m') }
  })
  it('quotes CSV separators, quotes and newlines, keeping numeric quantities numeric', () => {
    const csv = csvLines([line])
    expect(csv).toContain('"Tornillo; ""inox""\nM8"')
    expect(csv).toContain(';2,7;')
    expect(csv).toContain('\r\n')
  })
  it('neutralizes spreadsheet formulas even behind controls or whitespace', () => {
    for (const attack of ['=1+2', '+SUM(A1)', '-1+1', '@SUM(A1)', '\t=1+1', '\r=1+1', '  =1+1', '\u0000=1+1']) {
      const csv = csvLines([{ ...line, reference: attack }])
      expect(csv).toContain("'" + attack.replace(/"/g, '""'))
    }
    expect(csvLines([{ ...line, quantity: 0 }])).toContain(';0;')
  })
  it('exports every route source line with its stop, distance and origin', () => {
    const csv = routeCsv(route)
    expect(csv).toContain('Parada;Distancia (m);')
    expect(csv.match(/1;1,234;/g)).toHaveLength(2)
    expect(csv).toContain('OT 1234')
    expect(csv).toContain('OT 2345')
  })
  it('paginates tables, repeats identity headers, wraps huge cells and keeps final data', () => {
    const warehouse = createWarehouse(); warehouse.name = 'Nave Central'
    const lines = Array.from({ length: 90 }, (_, i) => ({ ...line, id: String(i), reference: `REF-${i}`, description: i === 2 ? 'description '.repeat(2500) + 'END-LONG' : 'Tornillo M8' }))
    const pdf = buildReport({ warehouse, name: 'Inventory sample', kind: 'inventory', lines, generatedAt: new Date('2026-11-09T12:00:00Z') })
    const text = pdf.output()
    expect(pdf.getNumberOfPages()).toBeGreaterThan(5)
    expect(text.match(/\(Warehouse Layout\) Tj/g)?.length).toBe(pdf.getNumberOfPages())
    expect(text).toContain('/Creator (Warehouse Layout)')
    expect(text).toContain('Nave Central')
    expect(text).toContain('13:00')
    expect(text).toContain('END-LONG')
    expect(text).toContain('REF-89')
    expect(text.match(/Referencia/g)!.length).toBe(pdf.getNumberOfPages() - 1)
  })
  it('prints the route plan and preserved route lines, and sanitizes title controls', () => {
    const pdf = buildReport({ warehouse: createWarehouse(), kind: 'route', name: 'Route\u0000 sample', lines: [], route })
    const text = pdf.output()
    expect(text).toContain('Route sample')
    expect(text).toContain('OT 1234')
    expect(text).toContain('OT 2345')
    expect(text).toContain('Parada')
    expect(text).not.toContain('\u0000')
  })
  it.each([true, false])('explains mesh precision for exact=%s without overstating path optimality', exact => {
    const text = buildReport({ warehouse: createWarehouse(), kind: 'route', name: 'Mesh', lines: [], route: { ...route, exact, cellSizeMm: 200 } }).output()
    expect(text).toContain(exact ? 'Orden óptimo en malla' : 'Orden aproximado en malla')
    expect(text).toContain('celda 0,2 m')
    expect(text).not.toContain('Ruta exacta')
  })
  it('produces a representative printable artifact when requested', async () => {
    if (!process.env.REPORT_PREVIEW) return
    const warehouse = exampleWarehouse()
    const sampleRoute = { ...route, path: [{ xMm: 500, yMm: 500 }, { xMm: 500, yMm: 4000 }, { xMm: 10000, yMm: 4000 }, { xMm: 10000, yMm: 14000 }], stops: route.stops.map(s => ({ ...s, point: { xMm: 10000, yMm: 4000 }, lines: Array.from({ length: 60 }, (_, i) => ({ ...line, id: String(i), reference: `TOR-${i}`, description: i === 2 ? 'Descripción larga de material inoxidable. '.repeat(900) + 'FIN DESCRIPCION' : line.description })) })) }
    const pdf = buildReport({ warehouse, name: 'OT 1234 - Preparación', kind: 'route', lines: [], route: sampleRoute, generatedAt: new Date('2026-11-09T12:00:00Z') })
    const directory = new URL('../../artifacts/pdf/', import.meta.url)
    await mkdir(directory, { recursive: true })
    await writeFile(new URL('reports-preview.pdf', directory), new Uint8Array(pdf.output('arraybuffer')))
  })
})
