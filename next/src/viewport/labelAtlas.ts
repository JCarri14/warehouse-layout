import * as THREE from 'three'

export const ATLAS_WIDTH = 2048
export const CELL_HEIGHT = 48
const INITIAL_HEIGHT = 1024
const MAX_HEIGHT = 4096
export const LABEL_HEIGHT = 18

export function labelWidthPx(text: string): number {
  return Math.max(48, Math.min(180, text.length * 7 + 16))
}

export type AtlasEntry = { u0: number; v0: number; u1: number; v1: number }
export type AtlasCanvas = Pick<HTMLCanvasElement, 'width' | 'height'> & {
  getContext(type: '2d'): CanvasRenderingContext2D | null
}
export type CanvasFactory = (width: number, height: number) => AtlasCanvas

type Cell = { x: number; y: number; width: number; uv: AtlasEntry }

function createAtlasCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function getContext(canvas: AtlasCanvas, fontSize: number): CanvasRenderingContext2D {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create the label atlas canvas context')
  context.fillStyle = '#ffffff'
  context.font = `600 ${fontSize}px Segoe UI`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  return context
}

/** Caches the text mask independently of marker position, appearance and selection. */
export class LabelAtlas {
  readonly texture: THREE.CanvasTexture
  version = 0
  private canvas: AtlasCanvas
  private context: CanvasRenderingContext2D
  private readonly cells = new Map<string, Cell>()
  private rows: number[] = []
  private readonly maxHeight: number
  private readonly cellScale: number
  private readonly cellHeight: number
  private readonly createCanvas: CanvasFactory

  constructor(createCanvas: CanvasFactory = createAtlasCanvas, maxTextureSize = MAX_HEIGHT) {
    this.createCanvas = createCanvas
    this.maxHeight = Math.min(MAX_HEIGHT, maxTextureSize)
    // Minimum-capability WebGL 2 devices can still fit the complete document.
    this.cellScale = this.maxHeight < MAX_HEIGHT ? .5 : 1
    this.cellHeight = CELL_HEIGHT * this.cellScale
    this.canvas = createCanvas(ATLAS_WIDTH, INITIAL_HEIGHT)
    this.context = getContext(this.canvas, 26 * this.cellScale)
    this.texture = new THREE.CanvasTexture(this.canvas as HTMLCanvasElement)
    this.texture.generateMipmaps = false
    this.texture.minFilter = THREE.LinearFilter
    this.texture.magFilter = THREE.LinearFilter
    this.texture.colorSpace = THREE.NoColorSpace
  }

  /**
   * Reserve the whole working set before reading UVs. Obsolete entries can be
   * removed under pressure without evicting labels that are still in use.
   */
  prepare(texts: Iterable<string>): void {
    const inUse = new Set(texts)
    const next = [...this.rows]
    for (const text of inUse) if (!this.cells.has(text)) this.place(next, this.cellWidth(text))
    if (next.length * this.cellHeight > this.maxHeight) {
      this.compact(inUse)
      return
    }
    for (const text of inUse) this.entry(text)
  }

  entry(text: string): AtlasEntry {
    const existing = this.cells.get(text)
    if (existing) return existing.uv
    const width = this.cellWidth(text)
    const next = [...this.rows]
    const position = this.place(next, width)
    if (position.y + this.cellHeight > this.maxHeight) throw new RangeError('Label atlas capacity exceeded')
    this.grow(position.y + this.cellHeight)
    this.rows = next
    const cell = { ...position, width, uv: { u0: 0, v0: 0, u1: 0, v1: 0 } }
    this.cells.set(text, cell)
    this.updateUvs(cell)
    this.context.fillText(text, cell.x + width / 2, cell.y + 24.5 * this.cellScale, width - 12 * this.cellScale)
    this.texture.needsUpdate = true
    return cell.uv
  }

  compact(inUse: Iterable<string>): void {
    // Place wide labels first, then fit short codes into the remaining gaps.
    const texts = [...new Set(inUse)].sort((a, b) => this.cellWidth(b) - this.cellWidth(a))
    const next: number[] = []
    for (const text of texts) this.place(next, this.cellWidth(text))
    const requiredHeight = next.length * this.cellHeight
    if (requiredHeight > this.maxHeight) throw new RangeError('Label atlas capacity exceeded')
    this.grow(requiredHeight)
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.cells.clear()
    this.rows = []
    this.version++
    for (const text of texts) this.entry(text)
    if (!texts.length) this.texture.needsUpdate = true
  }

  dispose(): void {
    this.texture.dispose()
  }

  private cellWidth(text: string): number {
    return Math.round(labelWidthPx(text) * this.cellHeight / LABEL_HEIGHT)
  }

  private place(rows: number[], width: number): { x: number; y: number } {
    const available = rows.findIndex(used => used + width <= ATLAS_WIDTH)
    const row = available < 0 ? rows.length : available
    const x = rows[row] ?? 0
    rows[row] = x + width
    return { x, y: row * this.cellHeight }
  }

  private grow(requiredHeight: number): void {
    if (requiredHeight <= this.canvas.height) return
    const height = Math.min(this.maxHeight, Math.max(this.canvas.height * 2, 2 ** Math.ceil(Math.log2(requiredHeight))))
    const canvas = this.createCanvas(ATLAS_WIDTH, height)
    const context = getContext(canvas, 26 * this.cellScale)
    context.drawImage(this.canvas as HTMLCanvasElement, 0, 0)
    this.canvas = canvas
    this.context = context
    // Three uses immutable texture storage after upload. Free it before
    // changing dimensions, keeping the texture object bound to the shader.
    this.texture.dispose()
    this.texture.image = canvas as HTMLCanvasElement
    for (const cell of this.cells.values()) this.updateUvs(cell)
    this.version++
  }

  private updateUvs({ x, y, width, uv }: Cell): void {
    uv.u0 = x / ATLAS_WIDTH
    uv.u1 = (x + width) / ATLAS_WIDTH
    // Canvas rows run downward and CanvasTexture flips them on upload.
    uv.v0 = 1 - (y + this.cellHeight) / this.canvas.height
    uv.v1 = 1 - y / this.canvas.height
  }
}
