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
let batches: RackBatches | undefined
afterEach(() => { batches?.dispose(); batches = undefined })
const meshes = (b: RackBatches) => b.objects.filter((o): o is THREE.InstancedMesh => o instanceof THREE.InstancedMesh)
const colorsOf = (mesh: THREE.InstancedMesh) => Array.from(mesh.instanceColor!.array)
const edgesOf = (b: RackBatches) => b.objects.find(o => o instanceof THREE.LineSegments) as THREE.LineSegments
const edgeColors = (b: RackBatches) => Array.from((edgesOf(b).geometry.getAttribute('color') as THREE.BufferAttribute).array)
const edgePositions = (b: RackBatches) => edgesOf(b).geometry.getAttribute('position') as THREE.BufferAttribute
const matricesOf = (mesh: THREE.InstancedMesh) => Array.from(mesh.instanceMatrix.array)
/** Instance indices whose 16 matrix floats differ between two snapshots. */
const changedInstances = (a: number[], b: number[]) => [...new Set(a.flatMap((v, i) => v !== b[i] ? [Math.floor(i / 16)] : []))]
const ownedInstances = (mesh: THREE.InstancedMesh, id: string) => (mesh.userData.ids as string[]).flatMap((owner, i) => owner === id ? [i] : [])
const zeroScale = (mesh: THREE.InstancedMesh, i: number) => {
  const m = mesh.instanceMatrix.array
  return [0, 1, 2, 4, 5, 6, 8, 9, 10].every(k => m[i * 16 + k] === 0)
}
const clearRanges = (b: RackBatches) => {
  for (const mesh of meshes(b)) { mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceColor!.clearUpdateRanges() }
  const edges = edgesOf(b)
  if (edges) for (const name of ['position', 'color']) (edges.geometry.getAttribute(name) as THREE.BufferAttribute).clearUpdateRanges()
}

/** Shared contract of `setHidden` on every InstancedMesh of a batch. */
function expectHidden(b: RackBatches, id: string, before: number[][]) {
  let touched = 0
  meshes(b).forEach((mesh, m) => {
    const owned = ownedInstances(mesh, id)
    expect(changedInstances(before[m], matricesOf(mesh))).toEqual(owned)
    for (const i of owned) expect(zeroScale(mesh, i)).toBe(true)
    if (owned.length) touched++
  })
  expect(touched).toBeGreaterThan(0)
}

/** Bounding sphere as the renderer sees it: computed lazily on first use and then never refreshed. */
function rendererSphere(object: THREE.Object3D): THREE.Sphere {
  if (object instanceof THREE.InstancedMesh) { if (!object.boundingSphere) object.computeBoundingSphere(); return object.boundingSphere! }
  const geometry = (object as THREE.LineSegments).geometry
  if (!geometry.boundingSphere) geometry.computeBoundingSphere()
  return geometry.boundingSphere!
}

describe.each(['blocks', 'detailed'] as const)('límites del lote (%s)', mode => {
  it('cubren una estantería ocultada antes del primer dibujo y mostrada después', () => {
    const only = rack(1)
    batches = new RackBatches([only], { mode })
    batches.setHidden(only.id)
    const spheres = batches.objects.filter(o => o.visible).map(rendererSphere)
    batches.setHidden(null)
    const box = elementBoxes({ racks: [only], zones: [], fixtures: [] } as unknown as WarehouseDocument)[0]
    const corners = [box.min.x, box.max.x].flatMap(x => [box.min.y, box.max.y].flatMap(y => [box.min.z, box.max.z].map(z => new THREE.Vector3(x, y, z))))
    expect(spheres.length).toBeGreaterThan(0)
    // Only the bodies (blocks) or frames (detailed) span the whole box; every object must at least reach its own parts.
    expect(spheres.some(sphere => corners.every(c => sphere.distanceToPoint(c) <= 1e-3))).toBe(true)
    for (const sphere of spheres) expect(sphere.radius).toBeGreaterThan(0)
  })
})

describe('RackBatches en modo bloques', () => {
  it('una malla por tipo de pieza con todas las estanterías', () => {
    batches = new RackBatches(racks, { mode: 'blocks' })
    expect(batches.objects).toHaveLength(3)
    const [bodies, levels] = meshes(batches)
    expect(bodies.count).toBe(200)
    expect(levels.count).toBe(racks.reduce((sum, r) => sum + r.levels.length, 0))
    expect(batches.objects.filter(o => o instanceof THREE.LineSegments)).toHaveLength(1)
    expect(batches.hidden).toBeNull()
  })

  it('sin estanterías deja sus tres objetos ocultos', () => {
    batches = new RackBatches([], { mode: 'blocks' })
    expect(batches.objects).toHaveLength(3)
    for (const object of batches.objects) expect(object.visible).toBe(false)
  })

  it('atenúa solo su rango', () => {
    batches = new RackBatches(racks, { mode: 'blocks' })
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
    batches = new RackBatches(racks, { mode: 'blocks' })
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

  it('ocultar pone a escala cero exactamente su rango y degenera solo sus aristas', () => {
    batches = new RackBatches(racks, { mode: 'blocks' })
    const target = 'rack-11', index = 11
    const before = meshes(batches).map(matricesOf), positions = edgePositions(batches), beforeEdges = Array.from(positions.array)
    const perRack = beforeEdges.length / racks.length
    batches.setHidden(target)
    expect(batches.hidden).toBe(target)
    expectHidden(batches, target, before)
    const afterEdges = Array.from(positions.array)
    afterEdges.forEach((v, i) => { if (i < index * perRack || i >= (index + 1) * perRack) expect(v).toBe(beforeEdges[i]) })
    // Every vertex of its edge range collapses onto one point, so the segments have zero length.
    const own = afterEdges.slice(index * perRack, (index + 1) * perRack)
    for (let v = 0; v < own.length; v += 3) expect(own.slice(v, v + 3)).toEqual(own.slice(0, 3))
    expect(own).not.toEqual(beforeEdges.slice(index * perRack, (index + 1) * perRack))
  })

  it('mostrar restaura exactamente matrices y aristas', () => {
    batches = new RackBatches(racks, { mode: 'blocks' })
    const before = meshes(batches).map(matricesOf), beforeEdges = Array.from(edgePositions(batches).array)
    batches.setHidden('rack-11'); batches.setHidden(null)
    expect(batches.hidden).toBeNull()
    expect(meshes(batches).map(matricesOf)).toEqual(before)
    expect(Array.from(edgePositions(batches).array)).toEqual(beforeEdges)
  })

  it('cambiar de A a B restaura A y oculta B, con rangos de subida solo de ambos', () => {
    batches = new RackBatches(racks, { mode: 'blocks' })
    const before = meshes(batches).map(matricesOf), beforeEdges = Array.from(edgePositions(batches).array), perRack = beforeEdges.length / racks.length
    batches.setHidden('rack-11')
    clearRanges(batches)
    batches.setHidden('rack-42')
    expectHidden(batches, 'rack-42', before)
    const [bodies, levels] = meshes(batches)
    expect(bodies.instanceMatrix.updateRanges).toEqual([{ start: 11 * 16, count: 16 }, { start: 42 * 16, count: 16 }])
    const levelRange = (id: string) => { const own = ownedInstances(levels, id); return { start: own[0] * 16, count: own.length * 16 } }
    expect(levels.instanceMatrix.updateRanges).toEqual([levelRange('rack-11'), levelRange('rack-42')])
    expect(edgePositions(batches).updateRanges).toEqual([{ start: 11 * perRack, count: perRack }, { start: 42 * perRack, count: perRack }])
    expect(Array.from(edgePositions(batches).array).slice(11 * perRack, 12 * perRack)).toEqual(beforeEdges.slice(11 * perRack, 12 * perRack))
    // Hiding never touches colours.
    for (const mesh of meshes(batches)) expect(mesh.instanceColor!.updateRanges).toEqual([])
    expect((edgesOf(batches).geometry.getAttribute('color') as THREE.BufferAttribute).updateRanges).toEqual([])
  })

  it('ocultar la misma o una desconocida no sube nada de más', () => {
    batches = new RackBatches(racks, { mode: 'blocks' })
    const before = meshes(batches).map(matricesOf)
    batches.setHidden('rack-11'); clearRanges(batches)
    batches.setHidden('rack-11')
    for (const mesh of meshes(batches)) expect(mesh.instanceMatrix.updateRanges).toEqual([])
    expect(edgePositions(batches).updateRanges).toEqual([])
    batches.setHidden('no-existe')
    expect(batches.hidden).toBeNull()
    expect(meshes(batches).map(matricesOf)).toEqual(before)
  })

  it('atenuar una oculta solo cambia colores y no la vuelve visible', () => {
    batches = new RackBatches(racks, { mode: 'blocks' })
    batches.setHidden('rack-11')
    const hidden = meshes(batches).map(matricesOf), hiddenEdges = Array.from(edgePositions(batches).array)
    clearRanges(batches)
    expect(batches.appearance('rack-11')!.setDimmed(true, .58)).toBe(true)
    expect(batches.appearance('rack-11')!.setDimmed(false)).toBe(true)
    expect(meshes(batches).map(matricesOf)).toEqual(hidden)
    expect(Array.from(edgePositions(batches).array)).toEqual(hiddenEdges)
    for (const mesh of meshes(batches)) expect(mesh.instanceMatrix.updateRanges).toEqual([])
    expect(edgePositions(batches).updateRanges).toEqual([])
  })
})

const CONTENTS = ['shelves', 'pallets', 'bins', 'cartons'] as const
// Four content types, every rotation and some racks deeper than wide.
const detailedRacks = racks.map((r, i): Rack => ({ ...r, contents: CONTENTS[i % 4], rotation: ([0, 90, 180, 270] as const)[i % 4 === 1 ? 2 : i % 7 % 4], ...(i % 9 === 0 ? { widthMm: 1200, depthMm: 4800 } : {}) }))

describe('RackBatches en modo detallado', () => {
  it('detallado: una malla por material', () => {
    batches = new RackBatches(detailedRacks, { mode: 'detailed' })
    expect(batches.objects.length).toBeLessThanOrEqual(9)
    expect(batches.objects.every(o => o instanceof THREE.InstancedMesh)).toBe(true)
    const total = meshes(batches).reduce((sum, mesh) => sum + mesh.count, 0)
    expect(total).toBe(detailedRacks.reduce((sum, r) => sum + detailedParts(r, { active: false }).length, 0))
    expect(new Set(meshes(batches).map(mesh => mesh.userData.material)).size).toBe(batches.objects.length)
  })

  it('reproduce material, color y matriz de cada pieza', () => {
    batches = new RackBatches(detailedRacks, { mode: 'detailed' })
    const expected = new Map<PartMaterial, Array<{ id: string; color: THREE.Color; matrix: THREE.Matrix4 }>>()
    for (const r of detailedRacks) for (const part of detailedParts(r, { active: false })) {
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

  it('atenúa solo sus piezas', () => {
    batches = new RackBatches(detailedRacks, { mode: 'detailed' })
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

  it('ocultar pone a escala cero exactamente sus piezas en cada malla y mostrar las restaura', () => {
    batches = new RackBatches(detailedRacks, { mode: 'detailed' })
    const before = meshes(batches).map(matricesOf)
    batches.setHidden('rack-13')
    expectHidden(batches, 'rack-13', before)
    expect(meshes(batches).filter(mesh => ownedInstances(mesh, 'rack-13').length).length).toBeGreaterThan(2)
    batches.setHidden(null)
    expect(meshes(batches).map(matricesOf)).toEqual(before)
  })

  it('cambiar de A a B restaura A, oculta B y sube solo sus rangos', () => {
    batches = new RackBatches(detailedRacks, { mode: 'detailed' })
    const before = meshes(batches).map(matricesOf)
    batches.setHidden('rack-13')
    clearRanges(batches)
    batches.setHidden('rack-14')
    expectHidden(batches, 'rack-14', before)
    for (const mesh of meshes(batches)) {
      const expected = ['rack-13', 'rack-14'].flatMap(id => {
        const own = ownedInstances(mesh, id)
        return own.length ? [{ start: own[0] * 16, count: own.length * 16 }] : []
      })
      expect(mesh.instanceMatrix.updateRanges).toEqual(expected)
      expect(mesh.instanceColor!.updateRanges).toEqual([])
    }
  })

  it('sin estanterías no crea mallas', () => {
    batches = new RackBatches([], { mode: 'detailed' })
    expect(batches.objects).toHaveLength(0)
    expect(() => batches!.setHidden('rack-1')).not.toThrow()
    expect(batches.hidden).toBeNull()
  })
})
