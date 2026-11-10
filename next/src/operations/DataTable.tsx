import { InventoryOrderComposer } from './InventoryOrderComposer'
import { Icon } from '../editor/Icon'
import { t, useLanguage, locale } from '../i18n'
import { useEffect, useMemo, useState } from 'react'
import type { WarehouseDocument } from '../warehouse/document'
import { buildInventoryIndex, filterInventory, inventorySearchText, summarizeInventory, type InventoryFilterSummary } from './inventoryFilter'
import { useInventoryQuery } from './useInventoryQuery'
import { formatQuantity } from './imports'
import type { DataLine } from './types'
import './DataTable.css'

type Props = { onFilterChange?: (summary: InventoryFilterSummary | null) => void; lines: DataLine[]; warehouse: WarehouseDocument; selectedRack: string | null; onClearRack?: () => void; onFocus: (code: string) => void; orderName?: string; onAddToOrder?: (lines: DataLine[]) => boolean }
type SortKey = 'reference' | 'description' | 'location' | 'quantity'

export function DataTable({ onFilterChange, lines, warehouse, selectedRack, onClearRack, onFocus, onAddToOrder, orderName = '' }: Props) {
  const language = useLanguage()
  const collator = useMemo(() => new Intl.Collator(locale(language), { numeric: true, sensitivity: 'base' }), [language])
  const [query, setQuery] = useState(''), [status, setStatus] = useState('all'), [sort, setSort] = useState<SortKey>('location'), [descending, setDescending] = useState(false)
  const normalizedQuery = inventorySearchText(query.trim()), appliedQuery = useInventoryQuery(normalizedQuery)
  const updating = normalizedQuery !== appliedQuery
  const [pagination, setPagination] = useState<{ key: string; lines: DataLine[]; page: number }>({ key: '', lines, page: 0 })
  const pageKey = JSON.stringify([query, status, sort, descending, selectedRack])
  const page = pagination.key === pageKey && pagination.lines === lines ? pagination.page : 0
  const setPage = (next: number) => setPagination({ key: pageKey, lines, page: next })
  const [selection, setSelection] = useState<{ source: DataLine[]; key: string; ids: Set<string> }>({ source: lines, key: pageKey, ids: new Set() })
  const [composing, setComposing] = useState(false)
  const selected = selection.source === lines && selection.key === pageKey ? selection.ids : new Set<string>()
  const select = (id: string) => { const ids = new Set(selected); if (ids.has(id)) ids.delete(id); else ids.add(id); setSelection({ source: lines, key: pageKey, ids }); setComposing(false) }
  const rack = warehouse.racks.find(item => item.id === selectedRack || item.code === selectedRack)
  const indexed = useMemo(() => buildInventoryIndex(lines, warehouse), [lines, warehouse])
  const sorted = useMemo(() => [...indexed].sort((a, b) => {
    const order = sort === 'quantity' ? a.line.quantity - b.line.quantity : collator.compare(a.line[sort], b.line[sort])
    return (descending ? -order : order) || a.index - b.index
  }), [indexed, sort, descending, collator])
  const rackId = rack?.id ?? null
  const filtered = useMemo(() => filterInventory(sorted, appliedQuery, status, rackId), [sorted, appliedQuery, status, rackId])
  const summary = useMemo(() => summarizeInventory(filtered, !!appliedQuery || status !== 'all' || !!rackId), [filtered, appliedQuery, status, rackId])
  useEffect(() => { onFilterChange?.(summary) }, [onFilterChange, summary])
  useEffect(() => () => onFilterChange?.(null), [onFilterChange])
  const pages = Math.max(1, Math.ceil(filtered.length / 50)), currentPage = Math.min(page, pages - 1), start = currentPage * 50, visible = filtered.slice(start, start + 50)
  const selectedLines = selected.size ? filtered.filter(item => selected.has(item.line.id)).map(item => item.line) : []
  const units = summary.totalQuantity
  const unitsLabel = formatQuantity(Number(units.toPrecision(15)))
  const columns: [SortKey, string][] = [['reference', t('Referencia')], ['description', t('Descripción')], ['location', t('Ubicación')], ['quantity', t('Cantidad')]]
  const changeSort = (key: SortKey) => { if (sort === key) setDescending(current => !current); else { setSort(key); setDescending(false) } }
  return <section className="opd-table" aria-busy={updating} aria-label={t("Líneas de inventario")}>
    <div className="opd-filters"><label>{t("Buscar inventario")}<input type="search" aria-label={t("Buscar inventario")} placeholder={t("Referencia, descripción o ubicación")} value={query} onChange={event => setQuery(event.target.value)} /></label><label>{t("Estado de ubicaciones")}<select aria-label={t("Estado de ubicaciones")} value={status} onChange={event => setStatus(event.target.value)}><option value="all">{t("Todas las ubicaciones")}</option><option value="placed">{t("En el plano")}</option><option value="unplaced">{t("Sin ubicación en el plano")}</option></select></label></div>
    {rack && <div className="opd-rack-filter"><span>{t("Sección seleccionada:")}{" "}<strong>{rack.code}{rack.alias ? ` · ${rack.alias}` : ''}</strong></span>{onClearRack && <button type="button" aria-label={t('Quitar filtro de estantería')} onClick={onClearRack}><Icon name="close" size={13}/>{t('Quitar filtro')}</button>}</div>}
    <div className="opd-count" aria-live="polite">{updating && <span className="inventory-search-pending">{t("Actualizando búsqueda…")}</span>}<strong>{filtered.length}{" "}{t("de")}{" "}{lines.length}{" "}{t("líneas")}</strong><span>{unitsLabel}{" "}{t("unidades en los resultados")}</span>{filtered.length > 0 && <span>{t("Mostrando")}{" "}{start + 1}–{Math.min(start + 50, filtered.length)}</span>}</div>
    {onAddToOrder && selectedLines.length > 0 && <div className="inventory-selection" role="status"><span>{t('{0} artículos seleccionados', { 0: selectedLines.length })}</span><button type="button" disabled={updating} onClick={() => setComposing(true)}>{t('Añadir a orden…')}</button><button type="button" onClick={() => { setSelection({ source: lines, key: pageKey, ids: new Set() }); setComposing(false) }}>{t('Quitar selección')}</button></div>}
    {composing && selectedLines.length > 0 && onAddToOrder && <InventoryOrderComposer key={JSON.stringify(selectedLines.map(line => line.id))} lines={selectedLines} orderName={orderName} onCancel={() => setComposing(false)} onConfirm={requested => { if (onAddToOrder(requested)) { setComposing(false); setSelection({ source: lines, key: pageKey, ids: new Set() }) } }}/>} 
    <div className="opd-scroll"><table><thead><tr>{onAddToOrder && <th className="inventory-select-column"><input type="checkbox" disabled={updating} aria-label={t('Seleccionar página de inventario')} checked={visible.length > 0 && visible.every(item => selected.has(item.line.id))} onChange={event => { const ids = new Set(selected); visible.forEach(item => { if (event.target.checked) ids.add(item.line.id); else ids.delete(item.line.id) }); setSelection({ source: lines, key: pageKey, ids }); setComposing(false) }}/></th>}{columns.map(([key, title]) => <th key={key} scope="col" aria-sort={sort === key ? descending ? 'descending' : 'ascending' : 'none'}><button type="button" onClick={() => changeSort(key)} aria-label={t(`Ordenar por ${t(title).toLowerCase()}`)}>{t(title)}{sort === key && <span aria-hidden="true">{descending ? '↓' : '↑'}</span>}</button></th>)}<th scope="col">{t("Origen")}</th></tr></thead><tbody>
      {!visible.length && <tr><td className="opd-empty" colSpan={onAddToOrder ? 6 : 5}><strong>{lines.length ? t('No hay líneas que coincidan.') : t('Todavía no hay inventario.')}</strong><p>{lines.length ? t('Prueba otra búsqueda o cambia el filtro de ubicaciones.') : t('Importa un archivo para consultar sus artículos y ubicaciones.')}</p></td></tr>}
      {visible.map(({ line, index, location }) => <tr key={`${line.id}-${index}`} aria-selected={selected.has(line.id)}>{onAddToOrder && <td className="inventory-select-column"><input type="checkbox" disabled={updating} aria-label={t('Seleccionar {0}', { 0: `${line.reference || line.description} · ${line.location}` })} checked={selected.has(line.id)} onChange={() => select(line.id)}/></td>}<td>{line.reference || '—'}</td><td className="opd-description">{line.description || '—'}</td><td>{location.ok ? <button type="button" className="opd-location" onClick={() => onFocus(line.location)} aria-label={t(`Ver ${line.location} en el plano`)}>{line.location}</button> : <span className="opd-unplaced" title={t(location.message)}><span aria-hidden="true">⚠ </span>{line.location}<small>{t("Sin ubicación en el plano")}</small></span>}</td><td className="opd-number">{formatQuantity(line.quantity)}</td><td>{line.origin || '—'}</td></tr>)}
    </tbody></table></div>
    <nav className="opd-pagination" aria-label={t("Páginas del inventario")}><button type="button" aria-label={t("Página anterior")} disabled={!currentPage} onClick={() => setPage(Math.max(0, currentPage - 1))}>{t("Anterior")}</button><span>{t("Página")}{" "}{currentPage + 1}{" "}{t("de")}{" "}{pages}</span><button type="button" aria-label={t("Página siguiente")} disabled={currentPage >= pages - 1} onClick={() => setPage(Math.min(pages - 1, currentPage + 1))}>{t("Siguiente")}</button></nav>
  </section>
}
