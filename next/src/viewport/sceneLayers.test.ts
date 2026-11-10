import { expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { SceneLayers } from './sceneLayers'

it('reutiliza capas sin cambios y libera solo las sustituidas o retiradas', () => {
  const group = new THREE.Group(), layers = new SceneLayers(group), make = vi.fn(() => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    vi.spyOn(mesh.geometry, 'dispose'); vi.spyOn(mesh.material, 'dispose'); group.add(mesh)
  })
  layers.begin(); layers.use('a', [1], make); layers.use('b', [1], make); layers.end()
  const [a, b] = group.children as THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[]
  layers.begin(); layers.use('a', [1], make); layers.use('b', [2], make); layers.end()
  expect(group.children[0]).toBe(a); expect(make).toHaveBeenCalledTimes(3)
  expect(a.geometry.dispose).not.toHaveBeenCalled(); expect(b.geometry.dispose).toHaveBeenCalledOnce()
  layers.begin(); layers.use('a', [1], make); layers.end()
  expect(group.children).toEqual([a])
  layers.dispose(); expect(a.geometry.dispose).toHaveBeenCalledOnce(); expect(a.material.dispose).toHaveBeenCalledOnce()
})
