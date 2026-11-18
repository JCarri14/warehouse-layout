import * as THREE from 'three'
import { allElements, elementHeight, elementKind, footprint, type ElementKind, type WarehouseDocument } from '../warehouse/document'

// Axis-aligned boxes in scene metres (x = xMm / 1000, z = yMm / 1000), independent from the rendered meshes.
export type PickBox = { id: string; kind: ElementKind; min: THREE.Vector3; max: THREE.Vector3 }
export type ElementHit = { id: string; kind: ElementKind; point: THREE.Vector3 }

const ZONE_MIN_Y = -.016, ZONE_MAX_Y = -.008

export function elementBoxes(doc: WarehouseDocument): PickBox[] {
  return allElements(doc).map(element => {
    const b = footprint(element), kind = elementKind(element), zone = kind === 'zone'
    const x = b.x / 1000, z = b.y / 1000
    return {
      id: element.id, kind,
      min: new THREE.Vector3(x, zone ? ZONE_MIN_Y : 0, z),
      max: new THREE.Vector3(x + b.w / 1000, zone ? ZONE_MAX_Y : elementHeight(element) / 1000, z + b.d / 1000),
    }
  })
}

export function pickElement(ray: THREE.Ray, boxes: readonly PickBox[], selected: string | null): ElementHit | undefined {
  const box = new THREE.Box3(), point = new THREE.Vector3()
  let solid: ElementHit | undefined, solidDistance = Infinity
  let chosen: ElementHit | undefined, zone: ElementHit | undefined, zoneDistance = Infinity
  for (const candidate of boxes) {
    box.min.copy(candidate.min); box.max.copy(candidate.max)
    if (!ray.intersectBox(box, point)) continue
    const distance = point.distanceToSquared(ray.origin)
    if (candidate.kind !== 'zone') {
      if (distance < solidDistance) { solidDistance = distance; solid = { id: candidate.id, kind: candidate.kind, point: point.clone() } }
    } else if (candidate.id === selected) chosen = { id: candidate.id, kind: candidate.kind, point: point.clone() }
    else if (distance < zoneDistance) { zoneDistance = distance; zone = { id: candidate.id, kind: candidate.kind, point: point.clone() } }
  }
  return solid ?? chosen ?? zone
}
