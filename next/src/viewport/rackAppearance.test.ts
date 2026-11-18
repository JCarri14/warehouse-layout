import { expect, it } from 'vitest'
import * as THREE from 'three'
import { RackAppearance, combineDimmable } from './rackAppearance'

it('atenúa y restaura sin cambiar geometrías, materiales ni transparencia del cuerpo', () => {
  const material = new THREE.MeshStandardMaterial({ color: '#337b78' }), geometry = new THREE.BoxGeometry(1, 2, 3)
  const mesh = new THREE.Mesh(geometry, material), label = new THREE.Sprite(new THREE.SpriteMaterial({ opacity: .8 }))
  const appearance = new RackAppearance([mesh, label]), original = material.color.clone()
  expect(appearance.setDimmed(true)).toBe(true)
  expect(material.color.equals(original)).toBe(false); expect(label.material.opacity).toBeLessThan(.8)
  expect(mesh.geometry).toBe(geometry); expect(mesh.material).toBe(material); expect(material.transparent).toBe(false)
  expect(appearance.setDimmed(true)).toBe(false)
  expect(appearance.setDimmed(false)).toBe(true)
  expect(material.color.equals(original)).toBe(true); expect(label.material.opacity).toBe(.8)
  geometry.dispose(); material.dispose(); label.material.dispose()
})

it('el enfoque de diseño es más suave y cambia de intensidad sin acumular color', () => {
  const material = new THREE.MeshStandardMaterial({ color: '#337b78' }), geometry = new THREE.BoxGeometry()
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ opacity: .8 }))
  const appearance = new RackAppearance([new THREE.Mesh(geometry, material), label]), original = material.color.clone()
  appearance.setDimmed(true, .28)
  const soft = material.color.clone(), softOpacity = label.material.opacity
  appearance.setDimmed(true)
  const distance = (color: THREE.Color) => Math.hypot(color.r - original.r, color.g - original.g, color.b - original.b)
  expect(distance(material.color)).toBeGreaterThan(distance(soft))
  expect(label.material.opacity).toBeLessThan(softOpacity)
  expect(appearance.setDimmed(true, .28)).toBe(true)
  expect(material.color.equals(soft)).toBe(true)
  expect(appearance.setDimmed(true, .28)).toBe(false)
  appearance.setDimmed(false)
  expect(material.color.equals(original)).toBe(true); expect(label.material.opacity).toBe(.8)
  geometry.dispose(); material.dispose(); label.material.dispose()
})

it('combineDimmable atenúa y restaura todos sus miembros e informa solo de cambios reales', () => {
  const materials = [new THREE.MeshStandardMaterial({ color: '#337b78' }), new THREE.MeshStandardMaterial({ color: '#8a4e9b' })], geometry = new THREE.BoxGeometry()
  const [a, b] = materials.map(material => new RackAppearance([new THREE.Mesh(geometry, material)]))
  const originals = materials.map(material => material.color.clone())
  const combined = combineDimmable([a, b])
  expect(combined.setDimmed(true)).toBe(true)
  materials.forEach((material, i) => expect(material.color.equals(originals[i])).toBe(false))
  expect(combined.setDimmed(true)).toBe(false)
  expect(combined.setDimmed(false)).toBe(true)
  materials.forEach((material, i) => expect(material.color.equals(originals[i])).toBe(true))
  expect(combined.setDimmed(false)).toBe(false)
  // Only the first member changes: the change is still reported and the second member is not skipped.
  b.setDimmed(true)
  expect(combined.setDimmed(true)).toBe(true)
  expect(materials[0].color.equals(originals[0])).toBe(false)
  expect(combineDimmable([]).setDimmed(true)).toBe(false)
  geometry.dispose(); materials.forEach(material => material.dispose())
})
