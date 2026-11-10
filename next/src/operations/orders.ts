import { t } from '../i18n'
import type { OrderDraft } from './types'
export function validateOrderDraft(value: unknown): value is OrderDraft {
  if (!value || typeof value !== 'object') return false
  const order = value as OrderDraft
  return typeof order.name === 'string' && order.name.length <= 200 && Array.isArray(order.lines) && order.lines.length <= 50000 && order.lines.every(l => l && typeof l === 'object' && ['id', 'reference', 'description', 'location', 'quantityText', 'origin'].every(k => typeof l[k as keyof typeof l] === 'string' && l[k as keyof typeof l].length <= 4096)) && new Set(order.lines.map(l => l.id)).size === order.lines.length
}
export function encodeOrder(order: OrderDraft, warehouseId: string) {
  if (!validateOrderDraft(order)) throw new Error(t('El borrador de OT no es válido.'))
  return JSON.stringify({ format: 'optiruta-order', version: 1, warehouseId, order }, null, 2)
}
export function decodeOrder(source: string): { order: OrderDraft; warehouseId: string } {
  let value
  try { value = JSON.parse(source) } catch { throw new Error(t('El archivo no contiene JSON válido.')) }
  if (value?.format !== 'optiruta-order' || value.version !== 1 || typeof value.warehouseId !== 'string' || !validateOrderDraft(value.order)) throw new Error(t('El archivo no es una OT web compatible.'))
  return { order: value.order, warehouseId: value.warehouseId }
}
