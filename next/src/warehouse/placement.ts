import { allElements, elementKind, footprint, isRack, type PlacedElement, type Rack, type WarehouseDocument } from './document'
import { accessFace } from './locations'

export const DEFAULT_AISLE_MM = 1000
export type Rect = { x: number; y: number; w: number; d: number }

/** Franja de pasillo pegada a la cara de acceso, hacia fuera. Se deriva de accessFace, así que respeta giro e inversión. */
export function accessStrip(rack: Rack, aisleMm: number): Rect {
  const { start, end } = accessFace(rack)
  const nx = Math.sign(start.normalX), ny = Math.sign(start.normalY)
  const x0 = Math.min(start.xMm, end.xMm), y0 = Math.min(start.yMm, end.yMm)
  const w = Math.abs(end.xMm - start.xMm), d = Math.abs(end.yMm - start.yMm)
  return {
    x: nx < 0 ? x0 - aisleMm : x0, y: ny < 0 ? y0 - aisleMm : y0,
    w: nx ? aisleMm : w, d: ny ? aisleMm : d,
  }
}

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.d && a.y + a.d > b.y

/** Primera posición que respeta pasillos de acceso, o null si no hay ninguna. */
export function findPlacement(doc: WarehouseDocument, element: PlacedElement, preferred: readonly { x: number; y: number }[], aisleMm = DEFAULT_AISLE_MM): { x: number; y: number } | null {
  const zone = elementKind(element) === 'zone', b = footprint(element)
  const all = allElements(doc)
  const occupied = all.filter(e => (elementKind(e) === 'zone') === zone).map(footprint)
  const physical = all.filter(e => elementKind(e) !== 'zone').map(footprint)
  const strips = zone ? [] : doc.racks.map(r => accessStrip(r, aisleMm))
  const insideFloor = (r: Rect) => r.x >= 0 && r.y >= 0 && r.x + r.w <= doc.widthMm && r.y + r.d <= doc.depthMm
  const fits = (x: number, y: number) => {
    const rect = { x, y, w: b.w, d: b.d }
    if (!insideFloor(rect) || occupied.some(a => overlap(rect, a))) return false
    if (zone) return true
    if (strips.some(s => overlap(rect, s))) return false
    if (isRack(element)) {
      const own = accessStrip({ ...element, xMm: x, yMm: y }, aisleMm)
      if (!insideFloor(own) || physical.some(a => overlap(own, a))) return false
    }
    return true
  }
  const direct = preferred.find(p => fits(p.x, p.y))
  if (direct) return { x: direct.x, y: direct.y }
  const xs = [...new Set([1000, ...occupied.map(a => a.x + a.w + 500), 0, ...occupied.map(a => a.x + a.w), ...occupied.map(a => a.x + a.w + aisleMm)])].filter(x => x + b.w <= doc.widthMm)
  const ys = [...new Set([1000, ...occupied.map(a => a.y + a.d + 500), 0, ...occupied.map(a => a.y + a.d), ...occupied.map(a => a.y + a.d + aisleMm)])].filter(y => y + b.d <= doc.depthMm)
  for (const y of ys) for (const x of xs) if (fits(x, y)) return { x, y }
  return null
}
