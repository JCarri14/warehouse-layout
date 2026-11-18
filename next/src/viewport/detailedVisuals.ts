import * as THREE from 'three'
import { elementHeight, footprint, isRack, type PlacedElement } from '../warehouse/document'
import { buildRackContents, visualRackLevels, rackStructure } from './rackContents'

type Part = { width: number; height: number; depth: number; x: number; y: number; z: number }
type Options = { active: boolean }

export type PartMaterial = 'frame' | 'beam' | 'shelf' | 'body' | 'leg' | 'wood' | 'cardboard' | 'bin' | 'label'
/** `matrix` is in scene coordinates (already includes the element's position and rotation). */
export type DetailedPart = { material: PartMaterial; color: THREE.Color; matrix: THREE.Matrix4 }

export const PART_METALNESS: Record<PartMaterial, number> = { frame: .55, beam: .3, shelf: .1, body: .05, leg: .45, wood: .02, cardboard: .02, bin: .02, label: .02 }
const PART_ORDER: PartMaterial[] = ['frame', 'beam', 'shelf', 'body', 'leg', 'wood', 'cardboard', 'bin', 'label']

/** Parts of the detailed representation with matrices local to the element's group. */
function localParts(element: PlacedElement, options: Options): DetailedPart[] {
  const out: DetailedPart[] = []
  const width = element.widthMm / 1000, depth = element.depthMm / 1000
  const height = elementHeight(element) / 1000
  const position = new THREE.Vector3(), scale = new THREE.Vector3(), quaternion = new THREE.Quaternion()
  const batch = (parts: Part[], material: PartMaterial, color: THREE.ColorRepresentation) => {
    for (const part of parts) {
      position.set(part.x, part.y, part.z); scale.set(part.width, part.height, part.depth)
      out.push({ material, color: new THREE.Color(color), matrix: new THREE.Matrix4().compose(position, quaternion, scale) })
    }
  }
  const turn = isRack(element) && element.depthMm > element.widthMm
  const part = (w: number, h: number, d: number, x: number, y: number, z: number): Part => ({ width: turn ? d : w, height: h, depth: turn ? w : d, x: turn ? z : x, y, z: turn ? x : z })
  if (!isRack(element)) {
    if (element.kind !== 'table') {
      const h = element.kind === 'zone' ? .008 : height
      batch([part(width, h, depth, 0, h / 2, 0)], 'body', element.color)
      return out
    }
    const thickness = Math.min(.06, height / 5), post = Math.min(.08, width / 5, depth / 5, height / 5)
    batch([part(width, thickness, depth, 0, height - thickness / 2, 0)], 'body', element.color)
    const legs: Part[] = []
    for (const x of [-1, 1]) for (const z of [-1, 1]) legs.push(part(post, height - thickness, post, x * (width - post) / 2, (height - thickness) / 2, z * (depth - post) / 2))
    batch(legs, 'leg', options.active ? '#aa843a' : '#7b8d89')
    return out
  }

  const { width: length, depth: rackDepth, span, post, bays } = rackStructure(element)
  const board = Math.min(.035, height / 12, rackDepth / 8)
  const beam = Math.min(.09, height / 10, rackDepth / 6)
  const frames: Part[] = [], beams: Part[] = [], shelves: Part[] = []
  // Structural bays are visual geometry, independent of location column numbering.
  for (let bay = 0; bay <= bays; bay++) {
    const x = bay === 0 ? -length / 2 + post / 2 : bay === bays ? length / 2 - post / 2 : -length / 2 + bay * span
    for (const z of [-1, 1]) frames.push(part(post, height, post, x, height / 2, z * (rackDepth - post) / 2))
    // Top ties complete the frames; no extra storage levels or stock are inferred.
    frames.push(part(post, post, rackDepth, x, height - post / 2, 0))
  }
  for (const elevation of visualRackLevels(element)) {
    const boardY = Math.max(board / 2, Math.min(height - board / 2, elevation - board / 2))
    if (element.contents !== 'pallets') shelves.push(part(Math.max(post, length - post), board, Math.max(post, rackDepth - post), 0, boardY, 0))
    const beamY = Math.max(beam / 2, Math.min(height - beam / 2, elevation - beam / 2))
    for (const z of [-1, 1]) beams.push(part(length, beam, post, 0, beamY, z * (rackDepth - post) / 2))
  }
  batch(frames, 'frame', options.active ? '#aa843a' : '#6b8380')
  batch(beams, 'beam', element.color)
  batch(shelves, 'shelf', new THREE.Color(element.color).lerp(new THREE.Color('#d8e0d7'), .65))
  const contents = buildRackContents(element)
  const colors = { wood: '#b58a55', cardboard: '#bd9767', bin: '#608fa3', label: '#ede9d9' }
  for (const material of ['wood', 'cardboard', 'bin', 'label'] as const) batch(contents.filter(p => p.material === material), material, colors[material])
  return out
}

/** Parts of the detailed representation as plain data, with matrices in scene coordinates. */
export function detailedParts(element: PlacedElement, options: Options): DetailedPart[] {
  const bounds = footprint(element)
  const world = new THREE.Matrix4().compose(
    new THREE.Vector3((bounds.x + bounds.w / 2) / 1000, 0, (bounds.y + bounds.d / 2) / 1000),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -element.rotation * Math.PI / 180),
    new THREE.Vector3(1, 1, 1))
  return localParts(element, options).map(p => ({ ...p, matrix: world.clone().multiply(p.matrix) }))
}

/**
 * Adds illustrative structural parts at the element's real footprint and elevations.
 * Each material is one InstancedMesh, so shelves/frames do not add one draw call per part.
 * Every batch owns its geometry/material. The viewport's normal mesh traversal can dispose them.
 */
export function addDetailedElement(parent: THREE.Group, element: PlacedElement, options: Options): THREE.Group {
  const group = new THREE.Group(), bounds = footprint(element)
  group.name = `detail:${element.id}`; group.userData.id = element.id
  group.position.set((bounds.x + bounds.w / 2) / 1000, 0, (bounds.y + bounds.d / 2) / 1000)
  group.rotation.y = -element.rotation * Math.PI / 180
  parent.add(group)

  const parts = localParts(element, options)
  for (const material of PART_ORDER) {
    const batch = parts.filter(p => p.material === material)
    if (!batch.length) continue
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: batch[0].color, roughness: .65, metalness: PART_METALNESS[material] }), batch.length)
    batch.forEach((p, i) => mesh.setMatrixAt(i, p.matrix))
    mesh.instanceMatrix.needsUpdate = true
    mesh.userData.id = element.id; mesh.userData.detailed = true
    mesh.computeBoundingBox(); mesh.computeBoundingSphere()
    group.add(mesh)
  }
  return group
}
