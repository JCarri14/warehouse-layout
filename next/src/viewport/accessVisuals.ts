import * as THREE from 'three'
import type { Rack } from '../warehouse/document'
import { accessFace, columnAccess, type ResolvedLocation } from '../warehouse/locations'

type Label = (text: string, x: number, y: number, z: number, active: boolean, priority?: number) => void
export function drawAccess(group: THREE.Group, rack: Rack, selected: boolean, location: ResolvedLocation | undefined, label: Label) {
  const face = accessFace(rack)
  const point = (p: typeof face.start, elevation = .035, offset = .1) => new THREE.Vector3(p.xMm / 1000 + p.normalX * offset, elevation, p.yMm / 1000 + p.normalY * offset)
  const start = point(face.start), end = point(face.end)
  const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([start, end]), new THREE.LineBasicMaterial({ color: selected ? '#197e73' : '#739d95', transparent: true, opacity: selected ? 1 : .6, depthTest: !selected }))
  group.add(line)
  if (!selected) return
  // A small arrow follows column order, including reversed numbering and rotation.
  const direction = end.clone().sub(start).normalize(), side = new THREE.Vector3(-direction.z, 0, direction.x)
  const tip = end.clone(), back = tip.clone().addScaledVector(direction, -.3)
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([back.clone().addScaledVector(side, .12), tip, tip, back.clone().addScaledVector(side, -.12)]), new THREE.LineBasicMaterial({ color: '#197e73', depthTest: false })))
  for (let column = 1; column <= rack.columns; column++) {
    const p = columnAccess(rack, column), focused = location?.rackId === rack.id && Number(location.parts.column) === column
    const elevation = focused && location.elevationMm !== null ? location.elevationMm / 1000 + .12 : .08, position = point(p, elevation, .18)
    const marker = new THREE.Mesh(new THREE.SphereGeometry(focused ? .13 : .075, 12, 8), new THREE.MeshBasicMaterial({ color: focused ? '#b07a22' : '#1c8377', depthTest: false }))
    marker.position.copy(position); marker.userData.id = rack.id; marker.renderOrder = 8; group.add(marker)
    if (focused) {
      const floor = point(p, .04, .18)
      group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([floor, position]), new THREE.LineBasicMaterial({ color: '#b07a22', depthTest: false, transparent: true, opacity: .8 })))
      const text = point(p, elevation + .4, .5); label(location.code, text.x, text.y, text.z, true, 20)
    } else if (rack.columns <= 12 || column === 1 || column === rack.columns) {
      const text = point(p, .12, .48); label(String(column).padStart(2, '0'), text.x, text.y, text.z, true, -1)
    }
  }
}
