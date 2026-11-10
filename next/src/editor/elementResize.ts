import { t } from '../i18n'
import { footprint, type PlacedElement, type WarehouseDocument } from '../warehouse/document'
import { resizeDelta, type WarehouseEdge } from '../warehouse/resize'
import { elementById, replaceElement } from './commands'

/** Delta is positive outwards; dimensions are local, while edges refer to the visible footprint. */
export function elementResizeCandidate(element: PlacedElement, edge: WarehouseEdge, rawDelta: number, step: number): PlacedElement {
  if (!['left', 'right', 'top', 'bottom'].includes(edge) || !Number.isFinite(rawDelta) || !Number.isSafeInteger(step) || step < 0) throw new Error(t('Posición o paso de cuadrícula inválidos.'))
  const delta = step ? resizeDelta(rawDelta, step) : Math.round(rawDelta), rect = footprint(element)
  const horizontal = edge === 'left' || edge === 'right'
  const w = rect.w + (horizontal ? delta : 0), d = rect.d + (horizontal ? 0 : delta)
  const rotated = element.rotation % 180 !== 0
  return { ...element, xMm: rect.x - (edge === 'left' ? delta : 0), yMm: rect.y - (edge === 'top' ? delta : 0), widthMm: rotated ? d : w, depthMm: rotated ? w : d }
}
export function resizeElement(doc: WarehouseDocument, id: string, edge: WarehouseEdge, delta: number, step: number): WarehouseDocument {
  const original = elementById(doc, id), candidate = elementResizeCandidate(original, edge, delta, step)
  if (JSON.stringify(candidate) === JSON.stringify(original)) return doc
  return replaceElement(doc, candidate)
}
