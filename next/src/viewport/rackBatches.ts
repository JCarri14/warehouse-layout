import * as THREE from 'three'
import { elementHeight, footprint, type Rack } from '../warehouse/document'
import { DIM_COLOR, type Dimmable } from './rackAppearance'
import { PART_METALNESS, PART_ORDER, visitDetailedParts, type PartMaterial } from './detailedVisuals'
import { disposeObjects } from './sceneLayers'

const LEVEL_COLOR = '#adcbc4', EDGE_COLOR = '#34534a'
type Range = { attribute: THREE.BufferAttribute; original: Float32Array; start: number; count: number }

/** Dims a rack by rewriting only its slice of the shared colour buffers. */
class BatchAppearance implements Dimmable {
  private amount = 0
  private ranges: Range[]
  constructor(ranges: Range[]) { this.ranges = ranges }
  setDimmed(value: boolean, strength = .58): boolean {
    const amount = value ? Math.max(0, Math.min(1, strength)) : 0
    if (amount === this.amount) return false
    this.amount = amount
    const color = new THREE.Color()
    for (const { attribute, original, start, count } of this.ranges) {
      const array = attribute.array as Float32Array
      for (let i = start; i < start + count; i += 3) {
        color.setRGB(original[i], original[i + 1], original[i + 2])
        if (amount) color.lerp(DIM_COLOR, amount)
        array[i] = color.r; array[i + 1] = color.g; array[i + 2] = color.b
      }
      attribute.addUpdateRange(start, count); attribute.needsUpdate = true
    }
    return true
  }
}

type Built = { objects: THREE.Object3D[]; ranges: Map<string, Range[]> }

/** Blocks mode: bodies, real levels and body edges, one object each. */
function buildBlocks(batched: readonly Rack[]): Built {
  const levelCount = batched.reduce((sum, rack) => sum + rack.levels.length, 0)
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .85, metalness: .05 })
  const bodies = new THREE.InstancedMesh(geometry, material, batched.length)
  const levels = new THREE.InstancedMesh(geometry, material, levelCount)
  const unitEdges = new THREE.EdgesGeometry(geometry), unitPositions = unitEdges.getAttribute('position') as THREE.BufferAttribute
  const perRack = unitPositions.count * 3
  const positions = new Float32Array(batched.length * perRack), edgeColors = new Float32Array(batched.length * perRack)
  const matrix = new THREE.Matrix4(), color = new THREE.Color(), levelColor = new THREE.Color(LEVEL_COLOR), edgeColor = new THREE.Color(EDGE_COLOR)
  const position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion()
  const bodyIds: string[] = [], levelIds: string[] = [], slices: Array<{ id: string; body: number; level: number; levels: number; edge: number }> = []
  let levelIndex = 0
  batched.forEach((rack, i) => {
    const b = footprint(rack), x = b.x / 1000, z = b.y / 1000, w = b.w / 1000, d = b.d / 1000, h = elementHeight(rack) / 1000
    bodies.setMatrixAt(i, matrix.compose(position.set(x + w / 2, h / 2, z + d / 2), rotation, scale.set(w, h, d)))
    bodies.setColorAt(i, color.set(rack.color)); bodyIds.push(rack.id)
    slices.push({ id: rack.id, body: i, level: levelIndex, levels: rack.levels.length, edge: i * perRack })
    // Real levels only; the upper block remains a deliberately simple operational representation.
    for (const level of rack.levels) {
      levels.setMatrixAt(levelIndex, matrix.compose(position.set(x + w / 2, level.elevationMm / 1000 + .025, z + d / 2), rotation, scale.set(w + .035, .045, d + .035)))
      levels.setColorAt(levelIndex, levelColor); levelIds.push(rack.id); levelIndex++
    }
    for (let v = 0; v < unitPositions.count; v++) {
      const o = i * perRack + v * 3
      positions[o] = x + w / 2 + unitPositions.getX(v) * w; positions[o + 1] = h / 2 + unitPositions.getY(v) * h; positions[o + 2] = z + d / 2 + unitPositions.getZ(v) * d
      edgeColors[o] = edgeColor.r; edgeColors[o + 1] = edgeColor.g; edgeColors[o + 2] = edgeColor.b
    }
  })
  unitEdges.dispose()
  // setColorAt is lazy: make sure both meshes own a colour buffer even when empty.
  for (const mesh of [bodies, levels]) {
    mesh.instanceColor ??= new THREE.InstancedBufferAttribute(new Float32Array(mesh.count * 3), 3)
    mesh.visible = mesh.count > 0
  }
  bodies.userData.ids = bodyIds; levels.userData.ids = levelIds
  const edgeGeometry = new THREE.BufferGeometry()
  edgeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  edgeGeometry.setAttribute('color', new THREE.BufferAttribute(edgeColors, 3))
  const edges = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .6 }))
  edges.visible = batched.length > 0

  const bodyColors = bodies.instanceColor!, levelColors = levels.instanceColor!, edgeAttribute = edgeGeometry.getAttribute('color') as THREE.BufferAttribute
  const originals = { body: Float32Array.from(bodyColors.array), level: Float32Array.from(levelColors.array), edge: Float32Array.from(edgeColors) }
  const ranges = new Map<string, Range[]>()
  for (const slice of slices) {
    const own: Range[] = [
      { attribute: bodyColors, original: originals.body, start: slice.body * 3, count: 3 },
      { attribute: edgeAttribute, original: originals.edge, start: slice.edge, count: perRack },
    ]
    if (slice.levels) own.push({ attribute: levelColors, original: originals.level, start: slice.level * 3, count: slice.levels * 3 })
    ranges.set(slice.id, own)
  }
  return { objects: [bodies, levels, edges], ranges }
}

type PartBuffer = { matrices: Float32Array; colors: Float32Array; ids: string[]; count: number }
type PartSlice = { material: PartMaterial; start: number; count: number }

/**
 * Detailed mode: one InstancedMesh per part material present, with the part colour per instance on a
 * white material (same shading as `addDetailedElement`, whose material carries the colour instead).
 * Parts are written straight into growable arrays from the visitor's scratch matrix/colour.
 */
function buildDetailed(batched: readonly Rack[]): Built {
  const buffers = new Map<PartMaterial, PartBuffer>(), slices = new Map<string, PartSlice[]>()
  for (const rack of batched) {
    const own: PartSlice[] = []
    let current: PartSlice | undefined
    visitDetailedParts(rack, { active: false }, (material, color, matrix) => {
      let buffer = buffers.get(material)
      if (!buffer) buffers.set(material, buffer = { matrices: new Float32Array(256 * 16), colors: new Float32Array(256 * 3), ids: [], count: 0 })
      if (buffer.count * 16 === buffer.matrices.length) {
        const matrices = new Float32Array(buffer.matrices.length * 2), colors = new Float32Array(buffer.colors.length * 2)
        matrices.set(buffer.matrices); colors.set(buffer.colors); buffer.matrices = matrices; buffer.colors = colors
      }
      matrix.toArray(buffer.matrices, buffer.count * 16); color.toArray(buffer.colors, buffer.count * 3)
      buffer.ids.push(rack.id)
      // A rack's parts of one material are contiguous, so each material is a single range per rack.
      if (current?.material !== material) own.push(current = { material, start: buffer.count, count: 0 })
      current.count++; buffer.count++
    })
    slices.set(rack.id, own)
  }

  const geometry = new THREE.BoxGeometry(1, 1, 1), objects: THREE.Object3D[] = []
  const colorBuffers = new Map<PartMaterial, { attribute: THREE.BufferAttribute; original: Float32Array }>()
  for (const material of PART_ORDER) {
    const buffer = buffers.get(material)
    if (!buffer) continue
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .65, metalness: PART_METALNESS[material] }), buffer.count)
    ;(mesh.instanceMatrix.array as Float32Array).set(buffer.matrices.subarray(0, buffer.count * 16))
    const original = buffer.colors.slice(0, buffer.count * 3)
    mesh.instanceColor = new THREE.InstancedBufferAttribute(original.slice(), 3)
    mesh.userData.ids = buffer.ids; mesh.userData.material = material
    colorBuffers.set(material, { attribute: mesh.instanceColor, original })
    objects.push(mesh)
  }
  if (!objects.length) geometry.dispose()
  const ranges = new Map<string, Range[]>()
  for (const [id, own] of slices) ranges.set(id, own.map(({ material, start, count }) => ({ ...colorBuffers.get(material)!, start: start * 3, count: count * 3 })))
  return { objects, ranges }
}

/**
 * Non-selected racks drawn with one object per part type; `userData.ids` maps instance index → rack id.
 *
 * Ownership: whoever adds `objects` to a scene owns them. In the viewport they live in a `SceneLayers`
 * layer, which disposes them with the layer, so the viewport never calls `dispose()`. `dispose()` is for
 * standalone use (tests); it is idempotent and shares `SceneLayers`' routine, releasing each resource once.
 */
export class RackBatches {
  readonly objects: THREE.Object3D[]
  private appearances = new Map<string, BatchAppearance>()
  private disposed = false

  constructor(racks: readonly Rack[], options: { mode: 'blocks' | 'detailed'; exclude: string | null }) {
    const batched = racks.filter(rack => rack.id !== options.exclude)
    const { objects, ranges } = options.mode === 'blocks' ? buildBlocks(batched) : buildDetailed(batched)
    this.objects = objects
    for (const [id, own] of ranges) this.appearances.set(id, new BatchAppearance(own))
  }

  appearance(id: string): Dimmable | undefined { return this.appearances.get(id) }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    disposeObjects(this.objects)
    this.appearances.clear()
  }
}

