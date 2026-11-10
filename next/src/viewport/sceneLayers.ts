import * as THREE from 'three'

type Layer = { dependencies: readonly unknown[]; objects: THREE.Object3D[] }
function dispose(objects: THREE.Object3D[]) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>()
  for (const object of objects) object.traverse(child => {
    if (child instanceof THREE.InstancedMesh) child.dispose()
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      geometries.add(child.geometry)
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material)
    } else if (child instanceof THREE.Sprite) materials.add(child.material)
  })
  for (const material of materials) if ('map' in material && material.map instanceof THREE.Texture) textures.add(material.map)
  for (const texture of textures) texture.dispose()
  for (const geometry of geometries) geometry.dispose()
  for (const material of materials) material.dispose()
}

/** Keeps root objects flat for picking/labels while retaining unchanged GPU resources. */
export class SceneLayers {
  private layers = new Map<string, Layer>()
  private used = new Set<string>()
  private group: THREE.Group
  constructor(group: THREE.Group) { this.group = group }
  begin() { this.group.clear(); this.used.clear() }
  use(key: string, dependencies: readonly unknown[], build: () => void) {
    this.used.add(key)
    const previous = this.layers.get(key)
    if (previous && previous.dependencies.length === dependencies.length && dependencies.every((value, i) => Object.is(value, previous.dependencies[i]))) {
      for (const object of previous.objects) this.group.add(object)
      return
    }
    if (previous) dispose(previous.objects)
    const start = this.group.children.length
    build()
    this.layers.set(key, { dependencies: [...dependencies], objects: this.group.children.slice(start) })
  }
  end() {
    for (const [key, layer] of this.layers) if (!this.used.has(key)) { dispose(layer.objects); this.layers.delete(key) }
  }
  dispose() { for (const layer of this.layers.values()) dispose(layer.objects); this.layers.clear(); this.group.clear() }
}
