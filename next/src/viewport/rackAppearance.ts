import * as THREE from 'three'

type ColoredMaterial = THREE.Material & { color: THREE.Color }
const muted = new THREE.Color('#e4ece7')

/** Owns references, never clones geometry/materials and never changes mesh transparency. */
export class RackAppearance {
  private amount = 0
  private colors: Array<{ material: ColoredMaterial; original: THREE.Color }> = []
  private labels: Array<{ material: THREE.SpriteMaterial; opacity: number }> = []

  constructor(objects: THREE.Object3D[]) {
    const seen = new Set<THREE.Material>()
    for (const object of objects) object.traverse(child => {
      if (child instanceof THREE.Sprite) {
        if (!seen.has(child.material)) { this.labels.push({ material: child.material, opacity: child.material.opacity }); seen.add(child.material) }
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
    for (const { material, original } of this.colors) { material.color.copy(original); if (amount) material.color.lerp(muted, amount) }
    for (const { material, opacity } of this.labels) material.opacity = opacity * Math.max(.15, 1 - amount * .52 / .58)
    return true
  }
}
