import { describe, expect, it } from 'vitest'
import { addRack, createWarehouse, elementHeight, validateDocument } from '../warehouse/document'
import { buildRackContents, visualRackLevels, rackStructure } from './rackContents'
import { decode, encode } from '../persistence/documentCodec'

describe('contenido ilustrativo de estanterías', () => {
  const base = () => addRack(createWarehouse()).racks[0]
  it('conserva el contenido al guardar y rechaza valores desconocidos', () => {
    const doc = addRack(createWarehouse())
    doc.racks[0].contents = 'bins'
    expect(decode(encode(doc)).racks[0].contents).toBe('bins')
    expect(validateDocument({ ...doc, racks: [{ ...doc.racks[0], contents: 'unknown' }] })).not.toEqual([])
  })
  it('genera palets con carga o gavetas sin modificar niveles ni inventar ubicaciones', () => {
    const rack = base(), before = structuredClone(rack)
    expect(buildRackContents(rack)).toEqual([])
    expect(buildRackContents({ ...rack, contents: 'pallets' }).some(p => p.kind === 'box')).toBe(true)
    expect(buildRackContents({ ...rack, contents: 'bins' }).some(p => p.kind === 'bin-front')).toBe(true)
    expect(rack).toEqual(before)
  })
  it('elige una gaveta común con el hueco más restrictivo sin cambiar las cotas', () => {
    const rack = { ...base(), contents: 'bins' as const }, before = structuredClone(base().levels.map(l => l.elevationMm))
    const parts = buildRackContents(rack).filter(p => p.kind === 'bin-back')
    expect(new Set(parts.map(p => p.height)).size).toBe(1)
    expect(parts[0].height).toBe(.125)
    expect(rack.levels.map(l => l.elevationMm)).toEqual(before)
  })
  it('no convierte columnas de ubicación en montantes físicos', () => {
    const rack = { ...base(), columns: 10 }
    expect(rackStructure(rack).bays).toBe(3)
    expect(rackStructure({ ...rack, widthMm: 2000, depthMm: 8000 }).turn).toBe(true)
  })
  it('dibuja cartón sobre baldas con cierre, etiqueta y sin palets', () => {
    const rack = { ...base(), contents: 'cartons' as const }
    const parts = buildRackContents(rack)
    expect(parts.some(p => p.kind === 'carton')).toBe(true)
    expect(parts.some(p => p.kind === 'carton-tape')).toBe(true)
    expect(parts.some(p => p.kind === 'carton-label')).toBe(true)
    expect(parts.some(p => p.kind.startsWith('pallet'))).toBe(false)
    const doc = { ...createWarehouse(), racks: [rack] }
    expect(decode(encode(doc)).racks[0].contents).toBe('cartons')
  })
  it.each(['pallets', 'bins', 'cartons'] as const)('mantiene todas las piezas dentro de dimensiones reales: %s', contents => {
    for (const [widthMm, depthMm, heightMm] of [[6000,1200,3000],[1200,6000,3000],[200,150,400],[1,1,1]]) {
      const rack = { ...base(), contents, widthMm, depthMm, heightMm, columns: 3, levels: [{ id: 'z', code: '00', elevationMm: 0 }] }
      for (const part of buildRackContents(rack)) {
        expect([part.x,part.y,part.z,part.width,part.height,part.depth].every(Number.isFinite)).toBe(true)
        expect(part.width > 0 && part.height > 0 && part.depth > 0).toBe(true)
        expect(part.x - part.width / 2).toBeGreaterThanOrEqual(-widthMm / 2000 - 1e-8)
        expect(part.x + part.width / 2).toBeLessThanOrEqual(widthMm / 2000 + 1e-8)
        expect(part.z - part.depth / 2).toBeGreaterThanOrEqual(-depthMm / 2000 - 1e-8)
        expect(part.z + part.depth / 2).toBeLessThanOrEqual(depthMm / 2000 + 1e-8)
        expect(part.y - part.height / 2).toBeGreaterThanOrEqual(-1e-8)
        expect(part.y + part.height / 2).toBeLessThanOrEqual(heightMm / 1000 + 1e-8)
      }
    }
  })
  it('distribuye el presupuesto entre niveles y utiliza alturas orientativas sin guardarlas', () => {
    const rack = { ...base(), heightMm: null, levels: [], contents: 'bins' as const }
    expect(elementHeight(rack)).toBe(2000)
    expect(visualRackLevels(rack)).toHaveLength(5)
    expect(buildRackContents(rack).filter(p => p.kind === 'bin-base').length).toBeLessThanOrEqual(320)
    expect(rack.heightMm).toBeNull(); expect(rack.levels).toEqual([])
    expect(elementHeight({ ...rack, contents: 'pallets' })).toBe(4500)
    expect(visualRackLevels({ ...rack, contents: 'pallets' })).toHaveLength(3)
  })
  it.each(['front','back','left','right'] as const)('orienta la pared baja de las gavetas hacia %s', access => {
    const parts = buildRackContents({ ...base(), access, contents: 'bins' })
    const front = parts.find(p => p.kind === 'bin-front')!, back = parts.find(p => p.kind === 'bin-back')!
    expect(front.height).toBeLessThan(back.height)
    expect(access === 'front' ? front.z > back.z : access === 'back' ? front.z < back.z : access === 'left' ? front.x < back.x : front.x > back.x).toBe(true)
  })
})
