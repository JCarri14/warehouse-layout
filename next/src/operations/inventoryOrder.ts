import { t } from '../i18n'
import { uid } from '../warehouse/document'
import { validateOrderDraft } from './orders'
import { formatQuantity } from './imports'
import type { DataLine, OrderDraft } from './types'

export function appendInventoryToOrder(order: OrderDraft, lines: DataLine[]): OrderDraft {
  if (!lines.length) throw new Error(t('Selecciona al menos un artículo.'))
  if (order.lines.length + lines.length > 50000) throw new Error(t('La OT admite hasta 50.000 líneas.'))
  if (lines.some(line => !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 1e9 || Number(formatQuantity(line.quantity).replace(',', '.')) <= 0)) throw new Error(t('La cantidad debe ser positiva y no superar 1.000.000.000.'))
  const next = { ...order, lines: [...order.lines, ...lines.map(line => ({ id: uid(), reference: line.reference, description: line.description, location: line.location, quantityText: formatQuantity(line.quantity).replace(',', '.'), origin: order.name }))] }
  if (!validateOrderDraft(next)) throw new Error(t('No se han añadido artículos: la longitud de alguno de sus campos supera 4.096 caracteres. El inventario se conserva completo.'))
  return next
}
