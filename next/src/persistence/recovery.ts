import { t } from '../i18n'
import { decode } from './documentCodec'
import { validateDataLines } from '../operations/imports'
import { validateOrderDraft } from '../operations/orders'
import { validateRouteSettings } from '../operations/routing'
import type { WorkspaceSnapshot } from '../operations/types'
import { allElements } from '../warehouse/document'

export const RECOVERY_KEY = 'optiruta.workspace.recovery.v1'
export function hasRecoverableWork(session: WorkspaceSnapshot, pending?: WorkspaceSnapshot['pendingEdit']) {
  const w = session.warehouse
  return !!pending || session.settings !== null || session.order.name !== 'OT sin título' || w.racks.length > 0 || w.zones.length > 0 || w.fixtures.length > 0 || w.name !== 'Almacén sin título' || (w.locationPolicy ?? "strict") !== "strict" || w.gridSizeMm !== 1000 || w.widthMm !== 32000 || w.depthMm !== 34000 || w.locationTemplate !== '{S}{N}{C}' || session.inventory.lines.length > 0 || session.order.lines.length > 0
}
export type RecoveryEnvelope = { format: 'optiruta-recovery'; version: 1; savedAt: string; session: WorkspaceSnapshot }
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type RecoveryResult = { ok: true; envelope: RecoveryEnvelope | null } | { ok: false; message: string }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function validateSession(raw: unknown): WorkspaceSnapshot {
  if (!object(raw) || !object(raw.inventory) || typeof raw.inventory.name !== 'string' || raw.inventory.name.length > 200 || !validateDataLines(raw.inventory.lines) || !validateOrderDraft(raw.order)) throw new Error(t('La copia contiene inventario u OT inválidos.'))
  const warehouse = decode(JSON.stringify(raw.warehouse))
  if (raw.settings !== null && !validateRouteSettings(raw.settings)) throw new Error(t('Las opciones de recorrido de la copia no son válidas.'))
  if (!['design', 'inventory', 'order', 'route', 'reports'].includes(String(raw.mode)) || !(raw.selected === null || typeof raw.selected === 'string')) throw new Error(t('La sesión de la copia no es válida.'))
  if (raw.selected !== null && !allElements(warehouse).some(e => e.id === raw.selected)) throw new Error(t('La selección de la copia no existe en el almacén.'))
  if (typeof raw.savedWarehouse !== 'string' || typeof raw.savedOrder !== 'string') throw new Error(t('Falta el punto guardado de la sesión.'))
  const baseline = decode(raw.savedWarehouse)
  let orderBaseline: unknown
  try { orderBaseline = JSON.parse(raw.savedOrder) } catch { throw new Error(t('El punto guardado de la OT no es válido.')) }
  if (!validateOrderDraft(orderBaseline)) throw new Error(t('El punto guardado de la OT no es válido.'))
  let pendingEdit: WorkspaceSnapshot['pendingEdit']
  if (raw.pendingEdit !== undefined) {
    const edit = raw.pendingEdit
    if (!object(edit) || edit.warehouseId !== warehouse.id || edit.elementId !== raw.selected || !(edit.elementId === null || typeof edit.elementId === 'string') || !object(edit.values) || JSON.stringify(edit.values).length > 200000) throw new Error(t('Las propiedades pendientes de la copia no son válidas.'))
    pendingEdit = edit as WorkspaceSnapshot['pendingEdit']
  }
  return { ...raw, warehouse, savedWarehouse: JSON.stringify(baseline), pendingEdit } as WorkspaceSnapshot
}
export function encodeRecovery(session: WorkspaceSnapshot, savedAt = new Date().toISOString()) {
  const normalized = validateSession(session)
  return JSON.stringify({ format: 'optiruta-recovery', version: 1, savedAt, session: normalized })
}
export function decodeRecovery(source: string): RecoveryEnvelope {
  if (source.length > 32 * 1024 * 1024) throw new Error(t('La copia de recuperación es demasiado grande.'))
  const raw = JSON.parse(source)
  if (!object(raw) || raw.format !== 'optiruta-recovery' || raw.version !== 1 || typeof raw.savedAt !== 'string' || !Number.isFinite(Date.parse(raw.savedAt))) throw new Error(t('La copia de recuperación no es compatible o está dañada.'))
  return { format: 'optiruta-recovery', version: 1, savedAt: raw.savedAt, session: validateSession(raw.session) }
}
export function loadRecovery(storage: StorageLike): RecoveryResult {
  try { const source = storage.getItem(RECOVERY_KEY); return { ok: true, envelope: source ? decodeRecovery(source) : null } }
  catch { return { ok: false, message: t('No se ha podido leer la copia local. Puede estar dañada o el almacenamiento no está disponible.') } }
}
export function saveRecovery(storage: StorageLike, session: WorkspaceSnapshot): { ok: true; savedAt: string } | { ok: false; message: string } {
  try { const savedAt = new Date().toISOString(); storage.setItem(RECOVERY_KEY, encodeRecovery(session, savedAt)); return { ok: true, savedAt } }
  catch { return { ok: false, message: t('No se ha podido actualizar la copia local. Guarda archivos independientes; el navegador puede estar sin espacio o tener el almacenamiento bloqueado.') } }
}
export function restoreFormDraft<T extends Record<string, unknown>>(base: T, pending?: Record<string, unknown>): T {
  if (!pending) return base
  const next: Record<string, unknown> = { ...base }
  for (const key of Object.keys(base)) {
    const value = pending[key]
    if (typeof value === 'string' && value.length <= 10000 && ['string', 'number'].includes(typeof base[key])) next[key] = value
    else if (typeof value === 'boolean' && typeof base[key] === 'boolean') next[key] = value
    else if (typeof value === 'number' && Number.isFinite(value) && typeof base[key] === 'number') next[key] = value
    else if (key === 'levels' && Array.isArray(value) && value.length <= 100 && value.every(l => object(l) && ['id', 'code', 'elevation'].every(k => typeof l[k] === 'string' && (l[k] as string).length <= 10000))) next[key] = value
  }
  return next as T
}
