import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { addRack, createWarehouse, footprint } from '../warehouse/document'
import { addDetailedElement, detailedParts, PART_METALNESS } from './detailedVisuals'

describe('representación estructural detallada', () => {
  it.each([0, 90, 180, 270] as const)('respeta la huella girada %s y usa cotas reales', rotation => {
    const rack = { ...addRack(createWarehouse()).racks[0], rotation }
    const parent = new THREE.Group(), group = addDetailedElement(parent, rack, { active: false })
    parent.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(group), expected = footprint(rack)
    expect(bounds.min.x).toBeCloseTo(expected.x / 1000)
    expect(bounds.max.x).toBeCloseTo((expected.x + expected.w) / 1000)
    expect(bounds.min.z).toBeCloseTo(expected.y / 1000)
    expect(bounds.max.z).toBeCloseTo((expected.y + expected.d) / 1000)
    expect(bounds.min.y).toBeCloseTo(0)
    expect(bounds.max.y).toBeCloseTo(rack.heightMm! / 1000)
    expect(group.children).toHaveLength(3)
    expect(group.children.every(mesh => mesh instanceof THREE.InstancedMesh && mesh.userData.id === rack.id)).toBe(true)
    const shelves = group.children[2] as THREE.InstancedMesh
    expect(shelves.count).toBe(rack.levels.length)
  })
  it('dibuja baldas orientativas sin añadir niveles reales cuando faltan', () => {
    const rack = { ...addRack(createWarehouse()).racks[0], levels: [], heightMm: null }
    const group = addDetailedElement(new THREE.Group(), rack, { active: true })
    expect(group.children).toHaveLength(3)
    expect(rack.levels).toEqual([])
    expect(rack.heightMm).toBeNull()
  })
  it.each(['pallets', 'bins', 'cartons'] as const)('respeta la huella de estanterías profundas con contenido %s y todos los giros', contents => {
    for (const rotation of [0,90,180,270] as const) {
      const rack = { ...addRack(createWarehouse()).racks[0], widthMm: 2000, depthMm: 8000, columns: 10, contents, rotation }
      const group = addDetailedElement(new THREE.Group(), rack, { active: false })
      group.updateMatrixWorld(true)
      const bounds = new THREE.Box3().setFromObject(group), expected = footprint(rack)
      expect(bounds.min.x).toBeCloseTo(expected.x / 1000)
      expect(bounds.max.x).toBeCloseTo((expected.x + expected.w) / 1000)
      expect(bounds.min.z).toBeCloseTo(expected.y / 1000)
      expect(bounds.max.z).toBeCloseTo((expected.y + expected.d) / 1000)
      expect(bounds.max.y).toBeCloseTo(3)
      expect(group.children.every(mesh => mesh.userData.id === rack.id)).toBe(true)
    }
  })
  it('usa un tablero y cuatro patas para la mesa sin cambiar la huella', () => {
    const table = { id: 'mesa', code: 'M', kind: 'table' as const, name: 'Mesa', color: '#336699', xMm: 1000, yMm: 2000, widthMm: 2000, depthMm: 1000, heightMm: 900, rotation: 90 as const }
    const group = addDetailedElement(new THREE.Group(), table, { active: false })
    expect(group.children).toHaveLength(2)
    expect((group.children[1] as THREE.InstancedMesh).count).toBe(4)
    group.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(group)
    expect(bounds.max.y).toBeCloseTo(.9)
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(1)
    expect(bounds.max.z - bounds.min.z).toBeCloseTo(2)
  })
  it('detailedParts reproduce las piezas de addDetailedElement', () => {
    const base = addRack(createWarehouse()).racks[0]
    const table = { id: 'mesa', code: 'M', kind: 'table' as const, name: 'Mesa', color: '#336699', xMm: 1000, yMm: 2000, widthMm: 2000, depthMm: 1000, heightMm: 900, rotation: 90 as const }
    const obstacle = { id: 'obs', code: 'O', kind: 'obstacle' as const, name: 'Obstáculo', color: '#996633', xMm: 500, yMm: 700, widthMm: 800, depthMm: 600, heightMm: 1500, rotation: 270 as const }
    const zone = { id: 'zona', code: 'Z', kind: 'zone' as const, name: 'Zona', color: '#669933', xMm: 100, yMm: 300, widthMm: 3000, depthMm: 2000, rotation: 180 as const }
    const racks = (['shelves', 'pallets', 'bins', 'cartons'] as const).flatMap(contents => [0, 90].map(rotation => ({ ...base, contents, rotation: rotation as 0 | 90, widthMm: 2400, depthMm: contents === 'pallets' ? 1100 : 800 })))
    const deep = { ...base, contents: 'bins' as const, widthMm: 2000, depthMm: 6000, columns: 8, rotation: 90 as const }
    for (const element of [...racks, deep, table, obstacle, zone]) for (const active of [false, true]) {
      const group = addDetailedElement(new THREE.Group(), element, { active })
      group.updateMatrixWorld(true)
      const expected = new Map<string, number>()
      for (const mesh of group.children as THREE.InstancedMesh[]) {
        const material = mesh.material as THREE.MeshStandardMaterial
        const key = `${material.color.getHexString()}|${material.metalness}`
        expected.set(key, (expected.get(key) ?? 0) + mesh.count)
      }
      const parts = detailedParts(element, { active }), actual = new Map<string, number>()
      for (const part of parts) {
        const key = `${part.color.getHexString()}|${PART_METALNESS[part.material]}`
        actual.set(key, (actual.get(key) ?? 0) + 1)
      }
      expect(actual).toEqual(expected)
      const box = new THREE.Box3(), unit = new THREE.Box3(new THREE.Vector3(-.5, -.5, -.5), new THREE.Vector3(.5, .5, .5))
      for (const part of parts) box.union(unit.clone().applyMatrix4(part.matrix))
      const reference = new THREE.Box3().setFromObject(group)
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(box.min[axis]).toBeCloseTo(reference.min[axis])
        expect(box.max[axis]).toBeCloseTo(reference.max[axis])
      }
    }
  })
})
