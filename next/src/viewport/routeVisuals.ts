import * as THREE from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import type { RouteResult } from '../operations/types'

export function drawBeam(group: THREE.Group, x: number, z: number, base: number, radius: number, height: number, color: string, opacity = .13) {
  const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 64
  const context = canvas.getContext('2d')!, gradient = context.createLinearGradient(0, 0, 0, 64)
  gradient.addColorStop(0, 'rgba(255,255,255,0)'); gradient.addColorStop(1, 'rgba(255,255,255,1)')
  context.fillStyle = gradient; context.fillRect(0, 0, 1, 64)
  const texture = new THREE.CanvasTexture(canvas)
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius * .75, radius, height, 24, 1, true), new THREE.MeshBasicMaterial({ color, map: texture, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }))
  beam.position.set(x, base + height / 2, z); beam.renderOrder = 3; group.add(beam)
}

/** Widths are CSS pixels; Line2 updates its resolution on every render. */
export function drawRoute(group: THREE.Group, route: RouteResult, activeStop = 0) {
  const positions = route.path.flatMap(point => [point.xMm / 1000, .06, point.yMm / 1000])
  if (positions.length >= 6) for (const [color, linewidth, order] of [[0xf4f8f5, 7, 20], [0x236bb3, 4, 21]]) {
    const line = new Line2(new LineGeometry().setPositions(positions), new LineMaterial({ color, linewidth, depthTest: false, depthWrite: false }))
    line.renderOrder = order; line.frustumCulled = false; group.add(line)
  }
  const spacing = Math.max(4000, route.distanceMm / 90)
  let travelled = 0, nextArrow = spacing / 2
  for (let index = 1; index < route.path.length; index++) {
    const a = route.path[index - 1], b = route.path[index], dx = b.xMm - a.xMm, dz = b.yMm - a.yMm, distance = Math.hypot(dx, dz)
    while (distance > 0 && nextArrow < travelled + distance) {
      const fraction = (nextArrow - travelled) / distance
      const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-.32, 0, -.45, .32, 0, -.45, 0, 0, .55], 3))
      const arrow = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#124a86', depthTest: false, depthWrite: false, side: THREE.DoubleSide }))
      arrow.position.set((a.xMm + dx * fraction) / 1000, .09, (a.yMm + dz * fraction) / 1000); arrow.rotation.y = Math.atan2(dx, dz)
      arrow.userData.anchor = arrow.position.clone(); arrow.userData.laneOffset = new THREE.Vector3(dz / distance, 0, -dx / distance);
      arrow.renderOrder = 22; arrow.userData.screenSize = 11; group.add(arrow)
      nextArrow += spacing
    }
    travelled += distance
  }
  for (const [index, stop] of route.stops.entries()) {
    const active = index === activeStop
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: active ? '#b77712' : '#236bb3', depthTest: false, depthWrite: false }))
    mesh.position.set(stop.point.xMm / 1000, .12, stop.point.yMm / 1000); mesh.userData.screenSize = active ? 6 : 3.5; mesh.renderOrder = 23; group.add(mesh)
  }
}
