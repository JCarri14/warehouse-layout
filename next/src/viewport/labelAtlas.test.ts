import { describe, expect, it, vi } from 'vitest'
import { ATLAS_WIDTH, CELL_HEIGHT, LabelAtlas, labelWidthPx, type AtlasEntry, type CanvasFactory } from './labelAtlas'

function setup(maxTextureSize?: number) {
  const context = { fillText: vi.fn(), drawImage: vi.fn(), clearRect: vi.fn(), font: '' }
  const createCanvas: CanvasFactory = (width, height) => ({ width, height, getContext: () => context as unknown as CanvasRenderingContext2D })
  return { atlas: new LabelAtlas(createCanvas, maxTextureSize), context }
}

const long = (index: number) => `Zona de almacenamiento internacional ${index}`
const sequence = (length: number, format: (index: number) => string) => Array.from({ length }, (_, index) => format(index))

function expectValidPacking(entries: AtlasEntry[]) {
  for (const [index, cell] of entries.entries()) {
    expect(cell.u0).toBeGreaterThanOrEqual(0)
    expect(cell.v0).toBeGreaterThanOrEqual(0)
    expect(cell.u1).toBeLessThanOrEqual(1)
    expect(cell.v1).toBeLessThanOrEqual(1)
    for (const previous of entries.slice(0, index)) {
      const overlaps = previous.u0 < cell.u1 && previous.u1 > cell.u0 && previous.v0 < cell.v1 && previous.v1 > cell.v0
      if (overlaps) throw new Error(`Atlas cells overlap: ${JSON.stringify({ cell, previous })}`)
    }
  }
}

describe('LabelAtlas', () => {
  it('reutiliza la máscara y evita marcar la textura para otra subida', () => {
    const { atlas, context } = setup()
    const entry = atlas.entry('A5')
    const version = atlas.texture.version
    expect(atlas.entry('A5')).toBe(entry)
    expect(context.fillText).toHaveBeenCalledTimes(1)
    expect(atlas.texture.version).toBe(version)
  })

  it('usa el mismo ancho de pantalla y comprime texto largo al ancho de la celda', () => {
    const { atlas, context } = setup()
    expect(labelWidthPx('A5')).toBe(48)
    expect(labelWidthPx('OBS-01')).toBe(58)
    expect(labelWidthPx(long(1))).toBe(180)
    atlas.entry(long(1))
    const width = 180 * CELL_HEIGHT / 18
    expect(context.font).toBe('600 26px Segoe UI')
    expect(context.fillText).toHaveBeenCalledWith(long(1), width / 2, 24.5, width - 12)
  })

  it('empaqueta sin solapes y conserva las máscaras y UV al crecer', () => {
    const { atlas, context } = setup()
    const first = atlas.entry(long(0))
    const previous = { ...first }
    const oldImage = atlas.texture.image
    const entries = [first, ...sequence(115, i => long(i + 1)).map(text => atlas.entry(text))]
    expect(atlas.texture.image).toMatchObject({ width: ATLAS_WIDTH, height: 2048 })
    expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(oldImage, 0, 0)
    expect(atlas.version).toBe(1)
    expect(atlas.entry(long(0))).toBe(first)
    expect(first).toEqual({ ...previous, v0: 1 - (1 - previous.v0) / 2, v1: 1 })
    expectValidPacking(entries)
  })

  it('compacta entradas obsoletas sin perder el máximo de etiquetas de un documento', () => {
    const { atlas, context } = setup()
    const racks = sequence(260, i => `${String.fromCharCode(65 + Math.floor(i / 10))}${i % 10}`)
    const fixtures = sequence(200, i => `OBSTACULO-${String(i).padStart(10, '0')}`)
    const zones = sequence(100, i => `Zona de operaciones ${String(i).padStart(4, '0')}.`)
    const columns = sequence(12, i => String(i + 1).padStart(2, '0'))
    const inUse = [...racks, ...fixtures, ...zones, ...columns, long(300)]
    atlas.prepare(sequence(300, long))
    expect(atlas.texture.image.height).toBe(4096)
    const before = atlas.version
    atlas.prepare(inUse)
    expect(atlas.version).toBe(before + 1)
    expect(context.clearRect).toHaveBeenCalledExactlyOnceWith(0, 0, 2048, 4096)
    expectValidPacking(inUse.map(text => atlas.entry(text)))

    const minimum = setup(2048).atlas
    minimum.prepare(inUse)
    expect(minimum.texture.image.height).toBeLessThanOrEqual(2048)
    expectValidPacking(inUse.map(text => minimum.entry(text)))
  })
})
