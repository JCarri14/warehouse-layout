import * as THREE from 'three'
import { isLabelMarker, type LabelSpec } from './labelLayer'

type ColoredMaterial = THREE.Material & { color: THREE.Color }
/** Colour every dimmed element blends toward; shared by per-object and batched appearances. */
export const DIM_COLOR = new THREE.Color('#e4ece7')

export interface Dimmable { setDimmed(value: boolean, strength?: number): boolean }

/** One element drawn by several owners (e.g. a batch slice plus its own label layer). */
export function combineDimmable(parts: readonly Dimmable[]): Dimmable {
  return { setDimmed: (value, strength) => parts.reduce((changed, part) => part.setDimmed(value, strength) || changed, false) }
}

/** Owns references, never clones geometry/materials and never changes mesh transparency. */
export class RackAppearance implements Dimmable {
  private amount = 0
  private colors: Array<{ material: ColoredMaterial; original: THREE.Color }> = []
  private labels: Array<{ target: THREE.SpriteMaterial | LabelSpec; opacity: number }> = []

  constructor(objects: THREE.Object3D[]) {
    const seen = new Set<THREE.Material>()
    for (const object of objects) object.traverse(child => {
      if (isLabelMarker(child)) {
        const label = child.userData.label
        this.labels.push({ target: label, opacity: label.opacity })
      } else if (child instanceof THREE.Sprite) {
        if (!seen.has(child.material)) { this.labels.push({ target: child.material, opacity: child.material.opacity }); seen.add(child.material) }
      } else if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        for (const material of materials) {
          if (!seen.has(material) && 'color' in material && material.color instanceof THREE.Color) {
            this.colors.push({ material: material as ColoredMaterial, original: material.color.clone() }); seen.add(material)
          }
        }
      }
    })
  }
  setDimmed(value: boolean, strength = .58): boolean {
    const amount = value ? Math.max(0, Math.min(1, strength)) : 0
    if (amount === this.amount) return false
    this.amount = amount
    for (const { material, original } of this.colors) { material.color.copy(original); if (amount) material.color.lerp(DIM_COLOR, amount) }
    for (const { target, opacity } of this.labels) target.opacity = opacity * Math.max(.15, 1 - amount * .52 / .58)
    return true
  }
}
