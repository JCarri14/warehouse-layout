import { t } from '../i18n'
import type { RouteSettings } from '../operations/types'
import type { WarehouseDocument } from '../warehouse/document'
import { resizeDelta, resizeWarehouse, type WarehouseEdge } from '../warehouse/resize'

/** Resize the frame and its applied route points as one validated candidate. */
export function resizeSession(document: WarehouseDocument, settings: RouteSettings | null, edge: WarehouseEdge, movementMm: number, gridMm: number): { document: WarehouseDocument; settings: RouteSettings | null } {
  const next = resizeWarehouse(document, edge, movementMm, gridMm)
  if (next === document || !settings) return { document: next, settings }
  const delta = resizeDelta(movementMm, gridMm)
  const dx = edge === 'left' ? delta : 0, dy = edge === 'top' ? delta : 0
  const shifted = { ...settings, start: { xMm: settings.start.xMm + dx, yMm: settings.start.yMm + dy }, end: { xMm: settings.end.xMm + dx, yMm: settings.end.yMm + dy } }
  if ([shifted.start, shifted.end].some(p => !Number.isFinite(p.xMm) || !Number.isFinite(p.yMm) || p.xMm < 0 || p.yMm < 0 || p.xMm > next.widthMm || p.yMm > next.depthMm)) throw new Error(t('No se puede recortar el almacén: el inicio o el destino quedarían fuera.'))
  return { document: next, settings: dx || dy ? shifted : settings }
}
