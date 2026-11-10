import { t } from '../i18n'
import { addRack, allElements, assertDocument, elementKind, footprint, isRack, uid, type ElementKind, type PlacedElement, type Rack, type Rotation, type WarehouseDocument, type WarehouseFixture, type WarehouseZone } from '../warehouse/document'

export function elementById(doc: WarehouseDocument, id: string): PlacedElement {
  const element = allElements(doc).find(e => e.id === id)
  if (!element) throw new Error(t('El elemento ya no existe.'))
  return element
}
export function replaceElement(doc: WarehouseDocument, element: PlacedElement) {
  const old = elementById(doc, element.id)
  if (elementKind(old) !== elementKind(element)) throw new Error(t('No se puede cambiar el tipo del elemento.'))
  let next: WarehouseDocument
  if (isRack(element)) next = { ...doc, racks: doc.racks.map(r => r.id === element.id ? element : r) }
  else if (element.kind === 'zone') next = { ...doc, zones: doc.zones.map(z => z.id === element.id ? element : z) }
  else next = { ...doc, fixtures: doc.fixtures.map(f => f.id === element.id ? element : f) }
  assertDocument(next); return next
}
export function snapCoordinate(value: number, step: number) {
  if (!Number.isFinite(value) || !Number.isSafeInteger(step) || step < 0) throw new Error(t('Posición o paso de cuadrícula inválidos.'))
  return Math.round(step ? Math.round(value / step) * step : value)
}
export function moveElement(doc: WarehouseDocument, id: string, x: number, y: number, step = 0) {
  return replaceElement(doc, { ...elementById(doc, id), xMm: snapCoordinate(x, step), yMm: snapCoordinate(y, step) })
}
export function rotateElement(doc: WarehouseDocument, id: string) {
  const element = elementById(doc, id)
  return replaceElement(doc, { ...element, rotation: ((element.rotation + 90) % 360) as Rotation })
}
export function removeElement(doc: WarehouseDocument, id: string) {
  elementById(doc, id)
  return { ...doc, racks: doc.racks.filter(e => e.id !== id), zones: doc.zones.filter(e => e.id !== id), fixtures: doc.fixtures.filter(e => e.id !== id) }
}
function freeCode(doc: WarehouseDocument, kind: ElementKind) {
  const category = kind === 'rack' ? doc.racks : kind === 'zone' ? doc.zones : doc.fixtures
  const used = category.map(e => e.code.trim().toUpperCase())
  const codes = kind === 'rack'
    ? Array.from({ length: 260 }, (_, i) => `${String.fromCharCode(65 + Math.floor(i / 10))}${i % 10}`)
    : Array.from({ length: 1000 }, (_, i) => `${({ zone: 'Z', obstacle: 'OBS', table: 'MESA' } as const)[kind]}-${String(i + 1).padStart(2, '0')}`)
  const code = codes.find(c => !used.includes(c))
  if (!code) throw new Error(t('No quedan códigos libres para este tipo de elemento.'))
  return code
}
function append(doc: WarehouseDocument, element: PlacedElement): WarehouseDocument {
  if (isRack(element)) return { ...doc, racks: [...doc.racks, element] }
  if (element.kind === 'zone') return { ...doc, zones: [...doc.zones, element] }
  return { ...doc, fixtures: [...doc.fixtures, element] }
}
function place(doc: WarehouseDocument, element: PlacedElement, preferred: Array<{ x: number; y: number }>) {
  const zone = elementKind(element) === 'zone', b = footprint(element)
  const occupied = allElements(doc).filter(e => (elementKind(e) === 'zone') === zone).map(footprint)
  const fits = (x: number, y: number) => x >= 0 && y >= 0 && x + b.w <= doc.widthMm && y + b.d <= doc.depthMm && !occupied.some(a => x < a.x + a.w && x + b.w > a.x && y < a.y + a.d && y + b.d > a.y)
  let position = preferred.find(p => fits(p.x, p.y))
  if (!position) {
    const xs = [...new Set([1000, ...occupied.map(a => a.x + a.w + 500), 0, ...occupied.map(a => a.x + a.w)])].filter(x => x + b.w <= doc.widthMm)
    const ys = [...new Set([1000, ...occupied.map(a => a.y + a.d + 500), 0, ...occupied.map(a => a.y + a.d)])].filter(y => y + b.d <= doc.depthMm)
    for (const y of ys) { for (const x of xs) { if (fits(x, y)) { position = { x, y }; break } } if (position) break }
  }
  if (!position && zone) position = [...preferred, { x: 0, y: 0 }].find(p => p.x >= 0 && p.y >= 0 && p.x + b.w <= doc.widthMm && p.y + b.d <= doc.depthMm)
  if (!position) throw new Error(t('No hay espacio libre para colocar este elemento.'))
  const next = append(doc, { ...element, xMm: position.x, yMm: position.y })
  assertDocument(next); return next
}
export function addElement(doc: WarehouseDocument, kind: ElementKind) {
  if (kind === 'rack') return addRack(doc)
  const code = freeCode(doc, kind)
  const common = { id: uid(), code, name: `${kind === 'zone' ? t('Zona') : kind === 'table' ? t('Mesa') : t('Obstáculo')} ${code.split('-')[1]}`, xMm: 1000, yMm: 1000, widthMm: kind === 'zone' ? 8000 : kind === 'table' ? 2000 : 1000, depthMm: kind === 'zone' ? 6000 : 1000, rotation: 0 as Rotation }
  let element: WarehouseZone | WarehouseFixture
  if (kind === 'zone') {
    let name = common.name, index = 2
    while (doc.zones.some(z => z.name.trim().toUpperCase() === name.toUpperCase())) name = `${common.name} (${index++})`
    element = { ...common, name, kind, color: '#ab8c48' }
  } else element = { ...common, kind, color: kind === 'table' ? '#6984a0' : '#8c9590', heightMm: kind === 'table' ? 900 : 3000 }
  return place(doc, element, [{ x: 1000, y: 1000 }])
}
export function duplicateElement(doc: WarehouseDocument, id: string) {
  const source = elementById(doc, id), b = footprint(source), code = freeCode(doc, elementKind(source))
  let copy: PlacedElement
  if (isRack(source)) copy = { ...source, id: uid(), code, levels: source.levels.map(l => ({ ...l, id: uid() })) }
  else {
    let name = `${source.name.slice(0, 68)} (copia)`, index = 2
    if (source.kind === 'zone') while (doc.zones.some(z => z.name.trim().toUpperCase() === name.toUpperCase())) name = `${source.name.slice(0, 64)} (copia ${index++})`
    copy = { ...source, id: uid(), code, name }
  }
  return place(doc, copy, [{ x: b.x + b.w + 500, y: b.y }, { x: b.x, y: b.y + b.d + 500 }, { x: b.x - b.w - 500, y: b.y }, { x: b.x, y: b.y - b.d - 500 }])
}
// Existing rack-specific entry points remain for callers and regression coverage.
function requireRack(doc: WarehouseDocument, id: string): Rack {
  const element = elementById(doc, id)
  if (!isRack(element)) throw new Error(t('El elemento no es una estantería.'))
  return element
}
export function moveRack(doc: WarehouseDocument, id: string, x: number, y: number, step = 0) { requireRack(doc, id); return moveElement(doc, id, x, y, step) }
export function rotateRack(doc: WarehouseDocument, id: string) { requireRack(doc, id); return rotateElement(doc, id) }
export function removeRack(doc: WarehouseDocument, id: string) { requireRack(doc, id); return removeElement(doc, id) }
export function duplicateRack(doc: WarehouseDocument, id: string) { requireRack(doc, id); return duplicateElement(doc, id) }
