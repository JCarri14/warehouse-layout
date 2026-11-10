import { expect, it } from 'vitest'
import * as THREE from 'three'
import { RackAppearance } from './rackAppearance'

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
