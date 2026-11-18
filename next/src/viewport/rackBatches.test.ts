import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { Rack, WarehouseDocument } from '../warehouse/document'
import { elementBoxes } from './elementPicker'
import { RackBatches } from './rackBatches'

const rack = (i: number): Rack => ({
  id: `rack-${i}`, code: `R${i}`, alias: '', color: i % 2 ? '#337b78' : '#8a4e9b',
  xMm: 1000 + i % 20 * 7000, yMm: 2000 + Math.floor(i / 20) * 5000, widthMm: 6000 - i % 3 * 1000, depthMm: 1200, heightMm: 3000 + i % 4 * 500,
  rotation: i % 5 === 0 ? 90 : 0, columns: 3, access: 'front', reverse: false,
  levels: Array.from({ length: i % 4 }, (_, n) => ({ id: `l-${i}-${n}`, code: `0${n + 1}`, elevationMm: n * 1000 })),
})
const racks = Array.from({ length: 200 }, (_, i) => rack(i))
const excluded = 'rack-7'
let batches: RackBatches | undefined
afterEach(() => { batches?.dispose(); batches = undefined })
const meshes = (b: RackBatches) => b.objects.filter((o): o is THREE.InstancedMesh => o instanceof THREE.InstancedMesh)
const colorsOf = (mesh: THREE.InstancedMesh) => Array.from(mesh.instanceColor!.array)
const edgeColors = (b: RackBatches) => Array.from(((b.objects.find(o => o instanceof THREE.LineSegments) as THREE.LineSegments).geometry.getAttribute('color') as THREE.BufferAttribute).array)

describe('RackBatches en modo bloques', () => {
  it('una malla por tipo de pieza', () => {
    batches = new RackBatches(racks, { mode: 'blocks', exclude: excluded })
    expect(batches.objects).toHaveLength(3)
    const [bodies, levels] = meshes(batches)
    expect(bodies.count).toBe(199)
    expect(levels.count).toBe(racks.filter(r => r.id !== excluded).reduce((sum, r) => sum + r.levels.length, 0))
    expect(batches.objects.filter(o => o instanceof THREE.LineSegments)).toHaveLength(1)
  })

  it('excluye la seleccionada', () => {
    batches = new RackBatches(racks, { mode: 'blocks', exclude: excluded })
    for (const mesh of meshes(batches)) {
      expect(mesh.userData.ids).toHaveLength(mesh.count)
      expect(mesh.userData.ids).not.toContain(excluded)
    }
    expect(batches.appearance(excluded)).toBeUndefined()
    expect(batches.appearance('rack-8')).toBeDefined()
  })

  it('atenúa solo su rango', () => {
    batches = new RackBatches(racks, { mode: 'blocks', exclude: excluded })
    const [bodies, levels] = meshes(batches)
    const target = 'rack-11' // three levels
    const beforeBodies = colorsOf(bodies), beforeLevels = colorsOf(levels), beforeEdges = edgeColors(batches)
    expect(batches.appearance(target)!.setDimmed(true, .58)).toBe(true)
    const afterBodies = colorsOf(bodies), afterLevels = colorsOf(levels), afterEdges = edgeColors(batches)
    const changed = (a: number[], b: number[], stride: number) => [...new Set(a.flatMap((v, i) => v !== b[i] ? [Math.floor(i / stride)] : []))]
    expect(changed(beforeBodies, afterBodies, 3).map(i => bodies.userData.ids[i])).toEqual([target])
    const levelIds = changed(beforeLevels, afterLevels, 3).map(i => levels.userData.ids[i])
    expect(levelIds).toEqual([target, target, target])
    expect(changed(beforeEdges, afterEdges, 72)).toHaveLength(1)
    expect(bodies.instanceColor!.updateRanges.length).toBeGreaterThan(0)
    expect(batches.appearance(target)!.setDimmed(false)).toBe(true)
    expect(colorsOf(bodies)).toEqual(beforeBodies); expect(colorsOf(levels)).toEqual(beforeLevels); expect(edgeColors(batches)).toEqual(beforeEdges)
    expect(batches.appearance(target)!.setDimmed(false)).toBe(false)
  })

  it('matrices en su sitio', () => {
    batches = new RackBatches(racks, { mode: 'blocks', exclude: excluded })
    const [bodies] = meshes(batches)
    const boxes = new Map(elementBoxes({ racks, zones: [], fixtures: [] } as unknown as WarehouseDocument).map(b => [b.id, b]))
    const matrix = new THREE.Matrix4(), unit = new THREE.Box3(new THREE.Vector3(-.5, -.5, -.5), new THREE.Vector3(.5, .5, .5))
    bodies.userData.ids.forEach((id: string, i: number) => {
      bodies.getMatrixAt(i, matrix)
      const box = unit.clone().applyMatrix4(matrix), expected = boxes.get(id)!
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(box.min[axis]).toBeCloseTo(expected.min[axis], 4); expect(box.max[axis]).toBeCloseTo(expected.max[axis], 4)
      }
    })
  })

  it('el modo detallado aún no está disponible', () => {
    expect(() => new RackBatches(racks, { mode: 'detailed', exclude: null })).toThrow(/not implemented/)
  })
})
