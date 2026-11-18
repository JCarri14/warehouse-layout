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

/** A rack's slice of a geometry buffer: instance matrices (16 floats each) or edge vertex positions (3 floats each). */
type Slot = { attribute: THREE.BufferAttribute; kind: 'matrices' | 'points'; start: number; count: number }
type Built = { objects: THREE.Object3D[]; ranges: Map<string, Range[]>; slots: Map<string, Slot[]> }

/** Zero-scale matrices (translation kept, so bounds stay put) or edges collapsed onto their first vertex. */
function collapse({ attribute, kind, start, count }: Slot) {
  const array = attribute.array as Float32Array
  if (kind === 'matrices') for (let i = start; i < start + count; i += 16) array.fill(0, i, i + 3).fill(0, i + 4, i + 7).fill(0, i + 8, i + 11)
  else for (let i = start + 3; i < start + count; i += 3) array.copyWithin(i, start, start + 3)
  attribute.addUpdateRange(start, count); attribute.needsUpdate = true
}

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
  const ranges = new Map<string, Range[]>(), slots = new Map<string, Slot[]>()
  const edgePositions = edgeGeometry.getAttribute('position') as THREE.BufferAttribute
  for (const slice of slices) {
    const own: Range[] = [
      { attribute: bodyColors, original: originals.body, start: slice.body * 3, count: 3 },
      { attribute: edgeAttribute, original: originals.edge, start: slice.edge, count: perRack },
    ]
    if (slice.levels) own.push({ attribute: levelColors, original: originals.level, start: slice.level * 3, count: slice.levels * 3 })
    ranges.set(slice.id, own)
    const hide: Slot[] = [{ attribute: bodies.instanceMatrix, kind: 'matrices', start: slice.body * 16, count: 16 }]
    if (slice.levels) hide.push({ attribute: levels.instanceMatrix, kind: 'matrices', start: slice.level * 16, count: slice.levels * 16 })
    hide.push({ attribute: edgePositions, kind: 'points', start: slice.edge, count: perRack })
    slots.set(slice.id, hide)
  }
  return { objects: [bodies, levels, edges], ranges, slots }
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
  const colorBuffers = new Map<PartMaterial, { attribute: THREE.BufferAttribute; original: Float32Array }>(), matrixBuffers = new Map<PartMaterial, THREE.BufferAttribute>()
  for (const material of PART_ORDER) {
    const buffer = buffers.get(material)
    if (!buffer) continue
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .65, metalness: PART_METALNESS[material] }), buffer.count)
    ;(mesh.instanceMatrix.array as Float32Array).set(buffer.matrices.subarray(0, buffer.count * 16))
    const original = buffer.colors.slice(0, buffer.count * 3)
    mesh.instanceColor = new THREE.InstancedBufferAttribute(original.slice(), 3)
    mesh.userData.ids = buffer.ids; mesh.userData.material = material
    colorBuffers.set(material, { attribute: mesh.instanceColor, original }); matrixBuffers.set(material, mesh.instanceMatrix)
    objects.push(mesh)
  }
  if (!objects.length) geometry.dispose()
  const ranges = new Map<string, Range[]>(), slots = new Map<string, Slot[]>()
  for (const [id, own] of slices) {
    ranges.set(id, own.map(({ material, start, count }) => ({ ...colorBuffers.get(material)!, start: start * 3, count: count * 3 })))
    slots.set(id, own.map(({ material, start, count }): Slot => ({ attribute: matrixBuffers.get(material)!, kind: 'matrices', start: start * 16, count: count * 16 })))
  }
  return { objects, ranges, slots }
}

/**
 * Every rack drawn with one object per part type; `userData.ids` maps instance index → rack id.
 * The selected rack stays in the batch but is hidden with `setHidden`, so selecting never rebuilds or re-uploads it.
 *
 * Ownership: whoever adds `objects` to a scene owns them. In the viewport they live in a `SceneLayers`
 * layer, which disposes them with the layer, so the viewport never calls `dispose()`. `dispose()` is for
 * standalone use (tests); it is idempotent and shares `SceneLayers`' routine, releasing each resource once.
 */
export class RackBatches {
  readonly objects: THREE.Object3D[]
  private appearances = new Map<string, BatchAppearance>()
  private slots: Map<string, Slot[]>
  private hiddenId: string | null = null
  /** Original contents of the hidden rack's slots, in `slots` order, written back when it is shown again. */
  private saved: Float32Array[] = []
  private disposed = false

  constructor(racks: readonly Rack[], options: { mode: 'blocks' | 'detailed' }) {
    const { objects, ranges, slots } = options.mode === 'blocks' ? buildBlocks(racks) : buildDetailed(racks)
    this.objects = objects; this.slots = slots
    for (const [id, own] of ranges) this.appearances.set(id, new BatchAppearance(own))
    // The renderer computes bounds lazily on first draw and never refreshes them. Computing them now, with every
    // rack at full size, keeps frustum culling right after `setHidden` collapses a rack and later restores it.
    // Collapsing keeps each instance's translation inside these bounds, so they stay valid while hidden.
    for (const object of objects) {
      if (!object.visible) continue
      if (object instanceof THREE.InstancedMesh) { object.computeBoundingBox(); object.computeBoundingSphere() }
      else if (object instanceof THREE.LineSegments) { object.geometry.computeBoundingBox(); object.geometry.computeBoundingSphere() }
    }
  }

  /** Colour-only: dimming never touches the matrices or edge positions that `setHidden` collapses. */
  appearance(id: string): Dimmable | undefined { return this.appearances.get(id) }

  /** Rack currently hidden in the batch (drawn elsewhere, e.g. as the selection), or null. */
  get hidden(): string | null { return this.hiddenId }

  /**
   * Hides one rack's instances (zero-scale matrices, degenerate edges) and shows the previously hidden one again,
   * uploading only those slices. An id not in the batch, or null, just restores. Same id: no work.
   */
  setHidden(id: string | null) {
    const next = id !== null && this.slots.has(id) ? id : null
    if (next === this.hiddenId) return
    if (this.hiddenId !== null) this.slots.get(this.hiddenId)!.forEach((slot, i) => {
      ;(slot.attribute.array as Float32Array).set(this.saved[i], slot.start)
      slot.attribute.addUpdateRange(slot.start, slot.count); slot.attribute.needsUpdate = true
    })
    this.saved = []
    this.hiddenId = next
    if (next === null) return
    for (const slot of this.slots.get(next)!) {
      this.saved.push((slot.attribute.array as Float32Array).slice(slot.start, slot.start + slot.count))
      collapse(slot)
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    disposeObjects(this.objects)
    this.appearances.clear(); this.slots.clear(); this.saved = []; this.hiddenId = null
  }
}

