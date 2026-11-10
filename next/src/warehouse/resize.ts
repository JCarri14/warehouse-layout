import { allElements, assertDocument, footprint, type WarehouseDocument } from './document'
import { t } from '../i18n'

export type WarehouseEdge = 'left' | 'right' | 'top' | 'bottom'

/** Quantize a signed movement; ties move outward/inward symmetrically. */
export function resizeDelta(deltaMm: number, gridMm: number): number {
  if (!Number.isFinite(deltaMm) || !Number.isSafeInteger(gridMm) || gridMm < 1 || gridMm > 1000000) throw new Error(t('Desplazamiento o tamaño de cuadrícula inválidos.'))
  const delta = Math.sign(deltaMm) * Math.round(Math.abs(deltaMm) / gridMm) * gridMm
  if (!Number.isSafeInteger(delta)) throw new Error(t('El desplazamiento es demasiado grande.'))
  return delta === 0 ? 0 : delta
}

/** Positive movement expands the chosen edge. Left/top preserve world positions by shifting content. */
export function resizeWarehouse(doc: WarehouseDocument, edge: WarehouseEdge, deltaMm: number, gridMm: number): WarehouseDocument {
  if (!['left', 'right', 'top', 'bottom'].includes(edge)) throw new Error(t('Borde del almacén inválido.'))
  const delta = resizeDelta(deltaMm, gridMm)
  if (!delta) return doc
  const horizontal = edge === 'left' || edge === 'right'
  const widthMm = doc.widthMm + (horizontal ? delta : 0), depthMm = doc.depthMm + (horizontal ? 0 : delta)
  if (!Number.isSafeInteger(widthMm) || !Number.isSafeInteger(depthMm) || widthMm < 1 || depthMm < 1 || widthMm > 1000000 || depthMm > 1000000) throw new Error(t('Las dimensiones deben estar entre 0,001 y 1.000 metros.'))
  const dx = edge === 'left' ? delta : 0, dy = edge === 'top' ? delta : 0
  const next: WarehouseDocument = {
    ...doc, widthMm, depthMm,
    racks: doc.racks.map(e => ({ ...e, xMm: e.xMm + dx, yMm: e.yMm + dy })),
    zones: doc.zones.map(e => ({ ...e, xMm: e.xMm + dx, yMm: e.yMm + dy })),
    fixtures: doc.fixtures.map(e => ({ ...e, xMm: e.xMm + dx, yMm: e.yMm + dy })),
  }
  const outside = allElements(next).filter(e => {
    const b = footprint(e)
    return b.x < 0 || b.y < 0 || b.x + b.w > widthMm || b.y + b.d > depthMm
  })
  if (outside.length) throw new Error(t(`No se puede recortar el almacén: ${outside.map(e => e.code).join(', ')} quedarían fuera.`))
  assertDocument(next)
  return next
}
