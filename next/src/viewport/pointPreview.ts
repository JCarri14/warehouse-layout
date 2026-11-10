import * as THREE from 'three'
import type { PointCell } from './pointPlacement'

export function createPointPreview(scene: THREE.Scene, render: () => void) {
  let group: THREE.Group | null = null
  const clear = () => {
    if (!group) return
    scene.remove(group)
    group.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach(material => material.dispose())
      }
    })
    group = null; render()
  }
  const show = (cell: PointCell | null, kind: 'start' | 'end' = 'start', valid = true) => {
    if (!cell) { clear(); return }
    if (!group) {
      group = new THREE.Group()
      const planeGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
      const fill = new THREE.Mesh(planeGeometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: .24, depthTest: false, depthWrite: false, side: THREE.DoubleSide }))
      const border = new THREE.LineSegments(new THREE.EdgesGeometry(planeGeometry), new THREE.LineBasicMaterial({ transparent: true, opacity: 1, depthTest: false, depthWrite: false }))
      const start = new THREE.Mesh(new THREE.CircleGeometry(.12, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, depthTest: false, depthWrite: false, side: THREE.DoubleSide }))
      const end = new THREE.Mesh(new THREE.BoxGeometry(.18, .02, .18).rotateY(Math.PI / 4), new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, depthTest: false, depthWrite: false }))
      const cross = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.35, 0, -.35), new THREE.Vector3(.35, 0, .35), new THREE.Vector3(-.35, 0, .35), new THREE.Vector3(.35, 0, -.35)]), new THREE.LineBasicMaterial({ transparent: true, opacity: 1, depthTest: false, depthWrite: false }))
      group.add(fill, border, start, end, cross)
      group.children.forEach((child, index) => { child.renderOrder = 80 + index; child.position.y = index * .002 })
      scene.add(group)
    }
    const [fill, border, start, end, cross] = group.children
    for (const object of [fill, border, cross]) object.scale.set(cell.widthMm / 1000, 1, cell.depthMm / 1000)
    start.visible = valid && kind === 'start'; end.visible = valid && kind === 'end'; cross.visible = !valid
    const markerScale = Math.min(cell.widthMm, cell.depthMm) / 1000
    start.scale.setScalar(markerScale); end.scale.setScalar(markerScale)
    const color = valid ? kind === 'start' ? '#147a68' : '#8a4e9b' : '#c13e32'
    group.children.forEach(child => { ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(color) })
    group.position.set(cell.point.xMm / 1000, .05, cell.point.yMm / 1000)
    render()
  }
  return { show, clear }
}
