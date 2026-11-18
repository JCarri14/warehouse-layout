import { describe, expect, it } from 'vitest'
import { createWarehouse, elementKind, footprint, type Rack, type Rotation, type WarehouseDocument, type WarehouseFixture } from './document'
import { accessStrip, findPlacement } from './placement'
import { addElement, duplicateElement } from '../editor/commands'

const rack = (over: Partial<Rack> = {}): Rack => ({ id: 'r1', code: 'A0', alias: '', color: '#337b78', xMm: 10000, yMm: 10000, widthMm: 6000, depthMm: 1200, heightMm: 3000, rotation: 0, columns: 3, access: 'front', reverse: false, levels: [{ id: 'l0', code: '00', elevationMm: 0 }], ...over })
const withRacks = (racks: Rack[], over: Partial<WarehouseDocument> = {}): WarehouseDocument => ({ ...createWarehouse(), racks, ...over })
const overlaps = (a: { x: number; y: number; w: number; d: number }, b: { x: number; y: number; w: number; d: number }) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.d && a.y + a.d > b.y
const obstacle = (over: Partial<WarehouseFixture> = {}): WarehouseFixture => ({ id: 'o1', code: 'OBS-01', name: 'Obstáculo 01', color: '#8c9590', kind: 'obstacle', heightMm: 3000, xMm: 0, yMm: 0, widthMm: 1000, depthMm: 1000, rotation: 0, ...over })

describe('accessStrip', () => {
  it('acceso frontal en los cuatro giros', () => {
    const expected: Record<Rotation, object> = {
      0: { x: 10000, y: 11200, w: 6000, d: 1000 },
      90: { x: 9000, y: 10000, w: 1000, d: 6000 },
      180: { x: 10000, y: 9000, w: 6000, d: 1000 },
      270: { x: 11200, y: 10000, w: 1000, d: 6000 },
    }
    for (const rotation of [0, 90, 180, 270] as Rotation[]) expect(accessStrip(rack({ rotation }), 1000)).toEqual(expected[rotation])
  })
  it('acceso izquierdo en los cuatro giros', () => {
    const expected: Record<Rotation, object> = {
      0: { x: 9000, y: 10000, w: 1000, d: 1200 },
      90: { x: 10000, y: 9000, w: 1200, d: 1000 },
      180: { x: 16000, y: 10000, w: 1000, d: 1200 },
      270: { x: 10000, y: 16000, w: 1200, d: 1000 },
    }
    for (const rotation of [0, 90, 180, 270] as Rotation[]) expect(accessStrip(rack({ rotation, access: 'left' }), 1000)).toEqual(expected[rotation])
  })
})

describe('colocación con pasillos', () => {
  it('duplicar no tapa el acceso', () => {
    const source = rack({ xMm: 1000, yMm: 1000 })
    const doc = withRacks([source], { fixtures: [obstacle({ xMm: 7000, yMm: 1000 })] })
    const next = duplicateElement(doc, source.id)
    const copy = next.racks.find(r => r.id !== source.id)!
    expect({ x: copy.xMm, y: copy.yMm }).not.toEqual({ x: 1000, y: 2700 })
    expect(overlaps(footprint(copy), accessStrip(source, 1000))).toBe(false)
  })
  it('un obstáculo nuevo evita la franja', () => {
    const source = rack({ xMm: 2500, yMm: 500, access: 'left' })
    const strip = accessStrip(source, 1000)
    expect(overlaps({ x: 1000, y: 1000, w: 1000, d: 1000 }, strip)).toBe(true)
    const next = addElement(withRacks([source]), 'obstacle')
    expect(next.fixtures).toHaveLength(1)
    expect(overlaps(footprint(next.fixtures[0]), strip)).toBe(false)
  })
  it('si no cabe con pasillo, se usa lo de hoy', () => {
    const source = rack({ xMm: 1000, yMm: 500 })
    const doc = withRacks([source], { widthMm: 8000, depthMm: 3000 })
    expect(findPlacement(doc, { ...source, id: 'x' }, [{ x: 7500, y: 500 }, { x: 1000, y: 1700 }])).toBeNull()
    const next = duplicateElement(doc, source.id)
    const copy = next.racks.find(r => r.id !== source.id)!
    expect({ x: copy.xMm, y: copy.yMm }).toEqual({ x: 1000, y: 1700 })
  })
  it('las zonas no tienen restricción', () => {
    const source = rack({ xMm: 2500, yMm: 500, access: 'left' })
    const next = addElement(withRacks([source]), 'zone')
    expect(elementKind(next.zones[0])).toBe('zone')
    expect(next.zones[0]).toMatchObject({ xMm: 1000, yMm: 1000 })
  })
})
