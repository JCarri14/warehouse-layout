import * as THREE from 'three'
import { elementHeight, footprint, type Rack } from '../warehouse/document'
import { DIM_COLOR, type Dimmable } from './rackAppearance'

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

/** Non-selected racks drawn with one object per part type; ids map instance index → rack id. */
export class RackBatches {
  readonly objects: THREE.Object3D[]
  private appearances = new Map<string, BatchAppearance>()

  constructor(racks: readonly Rack[], options: { mode: 'blocks' | 'detailed'; exclude: string | null }) {
    // Detailed batches arrive with task 4; detailed mode keeps its per-rack path until then.
    if (options.mode !== 'blocks') throw new Error('RackBatches: detailed mode not implemented')
    const batched = racks.filter(rack => rack.id !== options.exclude)
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
    this.objects = [bodies, levels, edges]

    const bodyColors = bodies.instanceColor!, levelColors = levels.instanceColor!, edgeAttribute = edgeGeometry.getAttribute('color') as THREE.BufferAttribute
    const originals = { body: Float32Array.from(bodyColors.array), level: Float32Array.from(levelColors.array), edge: Float32Array.from(edgeColors) }
    for (const slice of slices) {
      const ranges: Range[] = [
        { attribute: bodyColors, original: originals.body, start: slice.body * 3, count: 3 },
        { attribute: edgeAttribute, original: originals.edge, start: slice.edge, count: perRack },
      ]
      if (slice.levels) ranges.push({ attribute: levelColors, original: originals.level, start: slice.level * 3, count: slice.levels * 3 })
      this.appearances.set(slice.id, new BatchAppearance(ranges))
    }
  }

  appearance(id: string): Dimmable | undefined { return this.appearances.get(id) }

  dispose() {
    const [bodies, levels, edges] = this.objects as [THREE.InstancedMesh, THREE.InstancedMesh, THREE.LineSegments]
    bodies.dispose(); levels.dispose(); bodies.geometry.dispose(); (bodies.material as THREE.Material).dispose()
    edges.geometry.dispose(); (edges.material as THREE.Material).dispose()
    this.appearances.clear()
  }
}
