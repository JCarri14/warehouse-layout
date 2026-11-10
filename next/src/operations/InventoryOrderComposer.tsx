import { useState } from 'react'
import { t } from '../i18n'
import { formatQuantity, parseQuantity } from './imports'
import type { DataLine } from './types'

export function InventoryOrderComposer({ lines, orderName, onConfirm, onCancel }: { lines: DataLine[]; orderName: string; onConfirm: (lines: DataLine[]) => void; onCancel: () => void }) {
  const [quantities, setQuantities] = useState<Record<string, string>>({}), [error, setError] = useState('')
  return <section className="inventory-composer" aria-label={t('Preparar artículos para la orden')}>
    <h3>{t('Añadir a orden')}</h3><p>{t('OT de destino: {0}', { 0: orderName || t('OT sin título') })}</p>
    <p className="field-help">{t('Revisa las cantidades solicitadas. Esta acción no descuenta existencias.')}</p>
    <div className="inventory-quantities">{lines.map(line => <label key={line.id}><span><strong>{line.reference || line.description}</strong><small>{line.location} · {t('Disponible: {0}', { 0: formatQuantity(line.quantity) })}</small></span><input aria-label={t('Cantidad para {0}', { 0: `${line.reference || line.id} · ${line.location}` })} inputMode="decimal" value={quantities[line.id] ?? '1'} onChange={event => { setQuantities(values => ({ ...values, [line.id]: event.target.value })); setError('') }}/></label>)}</div>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="inventory-composer-actions"><button type="button" onClick={onCancel}>{t('Cancelar')}</button><button type="button" className="primary" onClick={() => {
      try {
        const requested = lines.map(line => ({ ...line, quantity: parseQuantity(quantities[line.id] ?? '1') }))
        if (requested.some(line => line.quantity <= 0)) throw new Error(t('La cantidad debe ser positiva.'))
        onConfirm(requested)
      } catch (error) { setError((error as Error).message) }
    }}>{t('Confirmar artículos')}</button></div>
  </section>
}
