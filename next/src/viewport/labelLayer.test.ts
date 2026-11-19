import { expect, it, vi } from 'vitest'
import type { BufferAttribute } from 'three'
import { LabelAtlas } from './labelAtlas'
import { LabelLayer, createLabelMarker } from './labelLayer'

function setup() {
  const fillText = vi.fn()
  const context = { fillText, drawImage: vi.fn(), clearRect: vi.fn() }
  const atlas = new LabelAtlas((width, height) => ({ width, height, getContext: () => context as unknown as CanvasRenderingContext2D }))
  const layer = new LabelLayer(atlas)
  const markers = ['A5', 'B2', 'Recepción'].map((text, index) => createLabelMarker(text, index, 2, 3, false))
  layer.sync(markers)
  const attrs = layer.mesh.geometry.attributes as Record<string, BufferAttribute>
  for (const attribute of Object.values(attrs)) attribute.clearUpdateRanges()
  return { atlas, layer, markers, attrs, fillText }
}

it('usa una instancia por marcador con sus coordenadas y dimensiones en píxeles', () => {
  const { layer, attrs } = setup()
  expect(layer.mesh.geometry.instanceCount).toBe(3)
  expect(Array.from(attrs.aAnchor.array.slice(0, 9))).toEqual([0, 2, 3, 1, 2, 3, 2, 2, 3])
  expect(Array.from(attrs.aSize.array.slice(0, 2))).toEqual([48, 18])
  layer.setViewport(1024, 768)
  expect(layer.mesh.material.uniforms.uViewport.value.toArray()).toEqual([1024, 768])
})

it('no sube atributos de nuevo si las instancias conservan sus valores', () => {
  const { layer, markers, attrs } = setup()
  const versions = Object.values(attrs).map(attribute => attribute.version)
  layer.sync(markers)
  expect(Object.values(attrs).map(attribute => attribute.version)).toEqual(versions)
  expect(Object.values(attrs).flatMap(attribute => attribute.updateRanges)).toEqual([])
})

it('seleccionar solo escribe el atributo activo y reutiliza la máscara', () => {
  const { atlas, layer, markers, attrs, fillText } = setup()
  const version = atlas.texture.version
  markers[1].userData.label.active = true
  layer.sync(markers)
  expect(Object.keys(attrs).filter(key => attrs[key].updateRanges.length)).toEqual(['aActive'])
  expect(attrs.aActive.updateRanges).toEqual([{ start: 1, count: 1 }])
  expect(attrs.aActive.getX(1)).toBe(1)
  expect(atlas.texture.version).toBe(version)
  expect(fillText).toHaveBeenCalledTimes(3)
})

it('modifica la visibilidad y la opacidad solo en los rangos que cambian', () => {
  const { layer, attrs } = setup()
  layer.setVisible(0, false)
  layer.setVisible(0, false)
  layer.setOpacity(2, .48)
  layer.setOpacity(2, .48)
  expect(attrs.aVisible.updateRanges).toEqual([{ start: 0, count: 1 }])
  expect(attrs.aOpacity.updateRanges).toEqual([{ start: 2, count: 1 }])
  expect(attrs.aVisible.getX(0)).toBe(0)
  expect(attrs.aOpacity.getX(2)).toBeCloseTo(.48)
})

it('traduce solamente el texto cambiado y actualiza sus UV', () => {
  const { layer, markers, attrs, fillText } = setup()
  fillText.mockClear()
  markers[2] = createLabelMarker('Receiving', 2, 2, 3, false)
  layer.sync(markers)
  expect(fillText).toHaveBeenCalledExactlyOnceWith('Receiving', expect.any(Number), expect.any(Number), expect.any(Number))
  expect(attrs.aUv.updateRanges).toEqual([{ start: 8, count: 4 }])
})
