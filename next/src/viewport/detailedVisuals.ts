import * as THREE from 'three'
import { elementHeight, footprint, isRack, type PlacedElement } from '../warehouse/document'
import { buildRackContents, visualRackLevels, rackStructure } from './rackContents'

type Part = { width: number; height: number; depth: number; x: number; y: number; z: number }
type Options = { active: boolean }

/**
 * Adds illustrative structural parts at the element's real footprint and elevations.
 * Each material is one InstancedMesh, so shelves/frames do not add one draw call per part.
 * Every batch owns its geometry/material. The viewport's normal mesh traversal can dispose them.
 */
export function addDetailedElement(parent: THREE.Group, element: PlacedElement, options: Options): THREE.Group {
  const group = new THREE.Group(), bounds = footprint(element)
  const width = element.widthMm / 1000, depth = element.depthMm / 1000
  const height = elementHeight(element) / 1000
  group.name = `detail:${element.id}`; group.userData.id = element.id
  group.position.set((bounds.x + bounds.w / 2) / 1000, 0, (bounds.y + bounds.d / 2) / 1000)
  group.rotation.y = -element.rotation * Math.PI / 180
  parent.add(group)

  const batch = (parts: Part[], color: THREE.ColorRepresentation, metalness: number) => {
    if (!parts.length) return
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color, roughness: .65, metalness }), parts.length)
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), quaternion = new THREE.Quaternion()
    parts.forEach((part, i) => {
      position.set(part.x, part.y, part.z); scale.set(part.width, part.height, part.depth)
      matrix.compose(position, quaternion, scale); mesh.setMatrixAt(i, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.userData.id = element.id; mesh.userData.detailed = true
    mesh.computeBoundingBox(); mesh.computeBoundingSphere()
    group.add(mesh)
  }
  const turn = isRack(element) && element.depthMm > element.widthMm
  const part = (w: number, h: number, d: number, x: number, y: number, z: number): Part => ({ width: turn ? d : w, height: h, depth: turn ? w : d, x: turn ? z : x, y, z: turn ? x : z })
  if (!isRack(element)) {
    if (element.kind !== 'table') {
      const h = element.kind === 'zone' ? .008 : height
      batch([part(width, h, depth, 0, h / 2, 0)], element.color, .05)
      return group
    }
    const thickness = Math.min(.06, height / 5), post = Math.min(.08, width / 5, depth / 5, height / 5)
    batch([part(width, thickness, depth, 0, height - thickness / 2, 0)], element.color, .05)
    const legs: Part[] = []
    for (const x of [-1, 1]) for (const z of [-1, 1]) legs.push(part(post, height - thickness, post, x * (width - post) / 2, (height - thickness) / 2, z * (depth - post) / 2))
    batch(legs, options.active ? '#aa843a' : '#7b8d89', .45)
    return group
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
  batch(frames, options.active ? '#aa843a' : '#6b8380', .55)
  batch(beams, element.color, .3)
  batch(shelves, new THREE.Color(element.color).lerp(new THREE.Color('#d8e0d7'), .65), .1)
  const contents = buildRackContents(element)
  const colors = { wood: '#b58a55', cardboard: '#bd9767', bin: '#608fa3', label: '#ede9d9' }
  for (const material of ['wood', 'cardboard', 'bin', 'label'] as const) batch(contents.filter(p => p.material === material), colors[material], .02)
  return group
}
