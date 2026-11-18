import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { Rack, WarehouseDocument } from '../warehouse/document'
import { elementBoxes } from './elementPicker'
import { RackBatches } from './rackBatches'
import { detailedParts, PART_METALNESS, type PartMaterial } from './detailedVisuals'

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
})

const CONTENTS = ['shelves', 'pallets', 'bins', 'cartons'] as const
// Four content types, every rotation and some racks deeper than wide.
const detailedRacks = racks.map((r, i): Rack => ({ ...r, contents: CONTENTS[i % 4], rotation: ([0, 90, 180, 270] as const)[i % 4 === 1 ? 2 : i % 7 % 4], ...(i % 9 === 0 ? { widthMm: 1200, depthMm: 4800 } : {}) }))
const kept = detailedRacks.filter(r => r.id !== excluded)

describe('RackBatches en modo detallado', () => {
  it('detallado: una malla por material', () => {
    batches = new RackBatches(detailedRacks, { mode: 'detailed', exclude: excluded })
    expect(batches.objects.length).toBeLessThanOrEqual(9)
    expect(batches.objects.every(o => o instanceof THREE.InstancedMesh)).toBe(true)
    const total = meshes(batches).reduce((sum, mesh) => sum + mesh.count, 0)
    expect(total).toBe(kept.reduce((sum, r) => sum + detailedParts(r, { active: false }).length, 0))
    expect(new Set(meshes(batches).map(mesh => mesh.userData.material)).size).toBe(batches.objects.length)
  })

  it('reproduce material, color y matriz de cada pieza', () => {
    batches = new RackBatches(detailedRacks, { mode: 'detailed', exclude: excluded })
    const expected = new Map<PartMaterial, Array<{ id: string; color: THREE.Color; matrix: THREE.Matrix4 }>>()
    for (const r of kept) for (const part of detailedParts(r, { active: false })) {
      if (!expected.has(part.material)) expected.set(part.material, [])
      expected.get(part.material)!.push({ id: r.id, ...part })
    }
    expect(new Set(meshes(batches).map(mesh => mesh.userData.material))).toEqual(new Set(expected.keys()))
    const matrix = new THREE.Matrix4(), color = new THREE.Color()
    for (const mesh of meshes(batches)) {
      const material = mesh.material as THREE.MeshStandardMaterial, parts = expected.get(mesh.userData.material)!
      expect(material.metalness).toBe(PART_METALNESS[mesh.userData.material as PartMaterial])
      expect(material.roughness).toBe(.65)
      expect(material.color.getHex()).toBe(0xffffff)
      expect(mesh.count).toBe(parts.length)
      expect(mesh.userData.ids).toEqual(parts.map(p => p.id))
      parts.forEach((part, i) => {
        mesh.getMatrixAt(i, matrix); mesh.getColorAt(i, color)
        expect(matrix.elements).toEqual(part.matrix.elements.map(Math.fround))
        expect([color.r, color.g, color.b]).toEqual([part.color.r, part.color.g, part.color.b].map(Math.fround))
      })
    }
  })

  it('excluye la seleccionada y atenúa solo sus piezas', () => {
    batches = new RackBatches(detailedRacks, { mode: 'detailed', exclude: excluded })
    expect(batches.appearance(excluded)).toBeUndefined()
    for (const mesh of meshes(batches)) expect(mesh.userData.ids).not.toContain(excluded)
    const target = 'rack-13', before = meshes(batches).map(colorsOf)
    expect(batches.appearance(target)!.setDimmed(true, .58)).toBe(true)
    let touched = 0
    meshes(batches).forEach((mesh, m) => {
      const after = colorsOf(mesh), changed = new Set<string>()
      after.forEach((v, i) => { if (v !== before[m][i]) changed.add(mesh.userData.ids[Math.floor(i / 3)]) })
      expect([...changed].every(id => id === target)).toBe(true)
      const owned = mesh.userData.ids.filter((id: string) => id === target).length
      if (owned) { expect(changed.size).toBe(1); expect(mesh.instanceColor!.updateRanges).toEqual([{ start: mesh.userData.ids.indexOf(target) * 3, count: owned * 3 }]); touched++ }
    })
    expect(touched).toBeGreaterThan(2)
    expect(batches.appearance(target)!.setDimmed(false)).toBe(true)
    expect(meshes(batches).map(colorsOf)).toEqual(before)
    expect(batches.appearance(target)!.setDimmed(false)).toBe(false)
  })

  it('sin estanterías no deja mallas vacías visibles', () => {
    batches = new RackBatches([], { mode: 'detailed', exclude: null })
    expect(batches.objects.every(o => !o.visible)).toBe(true)
  })
})
