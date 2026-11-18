import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { Rack, WarehouseDocument, WarehouseZone } from '../warehouse/document'
import { elementBoxes, pickElement } from './elementPicker'

const rack = (id: string, xMm: number, yMm: number, widthMm = 2000, depthMm = 1000, rotation: Rack['rotation'] = 0): Rack =>
  ({ id, code: id, alias: id, color: '#fff', xMm, yMm, widthMm, depthMm, heightMm: 3000, rotation, columns: 1, access: 'front', reverse: false, levels: [] })
const zone = (id: string, xMm: number, yMm: number, widthMm: number, depthMm: number): WarehouseZone =>
  ({ id, code: id, name: id, color: '#0f0', kind: 'zone', xMm, yMm, widthMm, depthMm, rotation: 0 })
const doc = (racks: Rack[], zones: WarehouseZone[] = []) => ({ racks, zones, fixtures: [] }) as unknown as WarehouseDocument
const down = (x: number, z: number) => new THREE.Ray(new THREE.Vector3(x, 20, z), new THREE.Vector3(0, -1, 0))

describe('selección analítica', () => {
  it('selecciona la estantería dentro de una zona', () => {
    const boxes = elementBoxes(doc([rack('r', 3000, 2000)], [zone('z', 0, 0, 8000, 6000)]))
    expect(pickElement(down(4, 2.5), boxes, null)).toMatchObject({ id: 'r', kind: 'rack' })
    expect(pickElement(down(1, 1), boxes, null)).toMatchObject({ id: 'z', kind: 'zone' })
  })
  it('prefiere la zona seleccionada entre zonas superpuestas', () => {
    const boxes = elementBoxes(doc([], [zone('arriba', 0, 0, 4000, 4000), zone('abajo', 0, 0, 4000, 4000)]))
    expect(pickElement(down(1, 1), boxes, 'abajo')?.id).toBe('abajo')
    expect(pickElement(down(1, 1), boxes, 'arriba')?.id).toBe('arriba')
  })
  it('elige la más cercana en isométrica', () => {
    const boxes = elementBoxes(doc([rack('lejos', 6000, 0, 1000, 1000), rack('cerca', 3000, 0, 1000, 1000)]))
    const ray = new THREE.Ray(new THREE.Vector3(0, 2.8, .5), new THREE.Vector3(1, -.05, 0).normalize())
    expect(pickElement(ray, boxes, null)?.id).toBe('cerca')
  })
  it('respeta el giro', () => {
    const [box] = elementBoxes(doc([rack('r', 1000, 1000, 6000, 1200, 90)]))
    expect(box.max.x - box.min.x).toBeCloseTo(1.2); expect(box.max.z - box.min.z).toBeCloseTo(6)
    expect(box.max.y).toBeCloseTo(3)
  })
  it('devuelve undefined si el rayo no toca nada', () => {
    expect(pickElement(down(50, 50), elementBoxes(doc([rack('r', 0, 0)])), null)).toBeUndefined()
  })
})
