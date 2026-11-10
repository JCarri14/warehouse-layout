import type { InventoryFilterSummary } from './inventoryFilter'
import { lengthText } from '../measurements'
import { appendInventoryToOrder } from './inventoryOrder'
import { t, useLanguage } from '../i18n'
import { useResizableWorkspace } from '../editor/ResizableWorkspace'
import { automaticRouteCellSize, defaultRouteSettings, pointIsFree } from './routing'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { uid, type WarehouseDocument } from '../warehouse/document'
import { resolveLocation, type ResolvedLocation } from '../warehouse/locations'
import { WarehouseViewport } from '../viewport/WarehouseViewport'
import { ImportDialog } from './ImportDialog'
import { DataTable } from './DataTable'
import { draftToLines, formatQuantity, readTables, validateDataLines, type ImportTable } from './imports'
import { decodeOrder, encodeOrder, validateOrderDraft } from './orders'
import { downloadBlob } from './downloads'
import { RoutePanel } from './RoutePanel'
import type { DataLine, DataSet, OperationMode, OrderDraft, RouteResult, RouteSettings } from './types'
import './OperationsPanel.css'

type Props = {
  onCoordinateDirty?: (dirty: boolean) => void; representation?: "blocks" | "detailed"; mode: OperationMode; onMode: (mode: OperationMode) => void; warehouse: WarehouseDocument; inventory: DataSet; onInventory: (data: DataSet) => void;
  order: OrderDraft; onOrder: (data: OrderDraft) => void; orderDirty: boolean; onOrderSaved: () => void; onOpenOrder: (order: OrderDraft) => void;
  settings: RouteSettings | null; onSettings: (settings: RouteSettings) => void; route?: RouteResult; onRoute: (route: RouteResult) => void;
  selected: string | null; onSelect: (id: string | null) => void; onLocate: (code: string) => boolean; location?: ResolvedLocation; locateRequest: number;
  notify: (message: string, error?: boolean) => void;
}
export function OperationsPanel(p: Props) {
  useLanguage()
  const [inventoryFilter, setInventoryFilter] = useState<{ source: DataLine[]; warehouse: WarehouseDocument; summary: InventoryFilterSummary | null } | null>(null)
  const reportInventoryFilter = useCallback((summary: InventoryFilterSummary | null) => setInventoryFilter({ source: p.inventory.lines, warehouse: p.warehouse, summary }), [p.inventory.lines, p.warehouse])
  const filter = p.mode === 'inventory' && inventoryFilter?.source === p.inventory.lines && inventoryFilter.warehouse === p.warehouse ? inventoryFilter.summary : null
  const rackKey = filter?.rackKey ?? ''
  const rackMatches = useMemo<string[] | null>(() => rackKey ? JSON.parse(rackKey) : null, [rackKey])
  const [planVisible, setPlanVisible] = useState(true)
  const [coordinatesDirty, setCoordinatesDirty] = useState(false)
  const [picking, setPicking] = useState<'start' | 'end' | null>(null)
  const { ref: workspaceRef, style: workspaceStyle, firstSeparator } = useResizableWorkspace({ kind: 'split', storageKey: 'optiruta.panels.' + p.mode, labels: [t('Ajustar ancho de datos y plano')], defaultRatio: p.mode === 'route' ? .44 : .62, enabled: planVisible })
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Cancel the external pointer tool when its surface changes.
    setPicking(null)
  }, [p.mode, p.warehouse.id, coordinatesDirty])
  const { onCoordinateDirty } = p
  useEffect(() => { onCoordinateDirty?.(p.mode === 'route' && coordinatesDirty); return () => onCoordinateDirty?.(false) }, [onCoordinateDirty, p.mode, coordinatesDirty])
  const toggleFocus = (id: string | null) => p.onSelect(id === p.selected || !p.warehouse.racks.some(rack => rack.id === id) ? null : id)
  const markPoint = (kind: 'start' | 'end') => { setPicking(kind); setPlanVisible(true) }
  const setPoint = (kind: 'start' | 'end', point: { xMm: number; yMm: number }) => {
    if (!pointIsFree(p.warehouse, point)) { p.notify('El punto debe estar en una zona libre del almacén.', true); return }
    try { const current = p.settings ?? defaultRouteSettings(p.warehouse); p.onSettings({ ...current, [kind]: point, ...(kind === 'end' ? { returnToStart: false } : current.returnToStart ? { end: point } : {}), cellSizeMm: automaticRouteCellSize(p.warehouse) }); setPicking(null) }
    catch (error) { p.notify((error as Error).message, true) }
  }
  const [importing, setImporting] = useState<{ tables: ImportTable[]; fileName: string; kind: 'inventory' | 'order' } | null>(null)
  const [reading, setReading] = useState(false), [openCandidate, setOpenCandidate] = useState<{ order: OrderDraft; warehouseId: string } | null>(null)
  const [view, setView] = useState<'top' | 'iso'>('top'), [fit, setFit] = useState(0), [step, setStep] = useState(0), [orderPage, setOrderPage] = useState(0), [orderSearch, setOrderSearch] = useState('')
  const [reportKind, setReportKind] = useState<'warehouse' | 'inventory' | 'order' | 'route'>(p.route ? 'route' : 'warehouse'), [exporting, setExporting] = useState(false)
  const inventoryPicker = useRef<HTMLInputElement>(null), orderPicker = useRef<HTMLInputElement>(null), draftPicker = useRef<HTMLInputElement>(null)
  const candidateDialog = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!openCandidate) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const controls = () => Array.from(candidateDialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    controls()[0]?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpenCandidate(null) }
      if (event.key !== 'Tab') return
      const buttons = controls(), first = buttons[0], last = buttons.at(-1)
      if (event.shiftKey && (document.activeElement === first || !candidateDialog.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !candidateDialog.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); previous?.focus() }
  }, [openCandidate])
  const validation = useMemo(() => draftToLines(p.order.lines, p.warehouse.locationTemplate), [p.order, p.warehouse.locationTemplate])
  const unplaced = useMemo(() => validation.lines.filter(l => !resolveLocation(p.warehouse, l.location).ok), [validation, p.warehouse])
  const filteredOrder = p.order.lines.map((line, index) => ({ line, index })).filter(({ line }) => !orderSearch || [line.reference, line.description, line.location, line.origin].some(v => v.toLowerCase().includes(orderSearch.toLowerCase())))
  const page = Math.min(orderPage, Math.max(0, Math.ceil(filteredOrder.length / 50) - 1)), shownOrder = filteredOrder.slice(page * 50, page * 50 + 50)
  const selectedRack = p.warehouse.racks.some(r => r.id === p.selected) ? p.selected : null
  const read = async (file: File | undefined, kind: 'inventory' | 'order') => {
    if (!file) return
    setReading(true)
    try { setImporting({ tables: await readTables(file), fileName: file.name, kind }) } catch (e) { p.notify((e as Error).message, true) }
    finally { setReading(false) }
  }
  const saveOrder = () => {
    try { downloadBlob(`${p.order.name || t('OT')}.optiruta-ot.json`, new Blob([encodeOrder(p.order, p.warehouse.id)], { type: 'application/json' })); p.onOrderSaved(); p.notify(t('OT generada para descargar, incluidas sus líneas pendientes de corregir.')) }
    catch (e) { p.notify((e as Error).message, true) }
  }
  const addLine = (source?: DataLine) => {
    if (p.order.lines.length >= 50000) { p.notify(t('La OT admite hasta 50.000 líneas.'), true); return }
    const next = { ...p.order, lines: [...p.order.lines, { id: uid(), reference: source?.reference ?? '', description: source?.description ?? '', location: source?.location ?? '', quantityText: '1', origin: p.order.name }] }
    if (!validateOrderDraft(next)) { p.notify(t('No se ha añadido la línea: la longitud de alguno de sus campos supera 4.096 caracteres. El inventario se conserva completo.'), true); return }
    p.onOrder(next); setOrderPage(Math.floor(p.order.lines.length / 50)); setOrderSearch('')
    p.notify(source ? t('Línea añadida a la OT con cantidad 1; puedes editarla en Órdenes de trabajo.') : t('Línea añadida a la OT.'))
  }
  const updateLine = (id: string, key: keyof OrderDraft['lines'][number], value: string) => p.onOrder({ ...p.order, lines: p.order.lines.map(l => l.id === id ? { ...l, [key]: value } : l) })
  const exportReport = async (pdf: boolean) => {
    setExporting(true)
    try {
      if ((reportKind === 'order' || reportKind === 'route') && validation.errors.length) throw new Error(t('Corrige las líneas de la OT antes de generar este informe. Puedes guardar el borrador como JSON.'))
      if (reportKind === 'route' && !p.route) throw new Error(t('Calcula una ruta con los datos actuales antes de exportar.'))
      const reports = await import('./reports')
      const lines = reportKind === 'inventory' ? p.inventory.lines : reportKind === 'route' ? p.route!.stops.flatMap(s => s.lines) : reportKind === 'order' ? validation.lines : []
      const name = reportKind === 'inventory' ? p.inventory.name || t('Inventario') : reportKind === 'warehouse' ? p.warehouse.name : p.order.name || t('OT')
      if (pdf) {
        const report = reports.buildReport({ warehouse: p.warehouse, kind: reportKind, lines, name, route: reportKind === 'route' ? p.route : undefined })
        downloadBlob(`${name}-${reportKind}.pdf`, report.output('blob'))
      } else {
        if (reportKind === 'warehouse') throw new Error(t('El plano se exporta en PDF; selecciona inventario, OT o recorrido para CSV.'))
        const csv = reportKind === 'route' ? reports.routeCsv(p.route!) : reports.csvLines(lines)
        downloadBlob(`${name}-${reportKind}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      }
      p.notify(t('Informe generado con todos los datos de la sección seleccionada; los filtros de pantalla no lo recortan.'))
    } catch (e) { p.notify((e as Error).message, true) } finally { setExporting(false) }
  }
  const heading = { design: '', inventory: t('Inventario'), order: t('Órdenes de trabajo'), route: t('Recorridos'), reports: t('Informes') }[p.mode]
  return <div ref={workspaceRef} style={workspaceStyle} className={`operations-workspace resizable-workspace mode-${p.mode} ${planVisible ? "" : "plan-hidden"}`}>
    <section className="operations-data" aria-label={heading}><header className="operations-heading"><h1>{heading}</h1><div className="task-actions">{p.mode === "inventory" && p.inventory.lines.length > 0 && <button className="primary" onClick={() => p.onMode("order")}>{t("Preparar OT →")}</button>}{p.mode === "order" && p.order.lines.length > 0 && <button className="primary" disabled={!!validation.errors.length || !!unplaced.length} onClick={() => p.onMode("route")}>{t("Preparar recorrido →")}</button>}{!planVisible && <button className="plan-toggle" aria-label={t("Mostrar plano")} title={t("Mostrar plano")} aria-expanded={false} aria-controls="consultation-plan" onClick={() => setPlanVisible(true)}><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><rect x="2" y="3" width="16" height="14" rx="2"/><path d="M12 3v14M5 8l3 2-3 2"/></svg></button>}</div></header>
      <input className="visually-hidden" type="file" accept=".csv,.tsv,.xls,.xlsx" aria-label={t("Archivo de inventario")} ref={inventoryPicker} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void read(file, 'inventory') }}/>
      <input className="visually-hidden" type="file" accept=".csv,.tsv,.xls,.xlsx" aria-label={t("Archivo de OT")} ref={orderPicker} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void read(file, 'order') }}/>
      <input className="visually-hidden" type="file" accept=".json" aria-label={t("Abrir borrador de OT")} ref={draftPicker} onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
        try { if (file.size > 10 * 1024 * 1024) throw new Error(t('La OT supera 10 MiB.')); setOpenCandidate(decodeOrder(await file.text())) } catch (error) { p.notify((error as Error).message, true) }
      }}/>
      {p.mode === 'inventory' && <><div className="operations-actions"><button className={!p.inventory.lines.length ? "primary" : undefined} disabled={reading} onClick={() => inventoryPicker.current?.click()}>{t("Importar inventario")}</button><span>{p.inventory.name || t('CSV, TSV, XLS o XLSX')}</span></div><p className="operations-help">{t("Consulta referencias y ubicaciones. Selecciona artículos para preparar una orden con las cantidades que necesites.")}</p><DataTable onFilterChange={reportInventoryFilter} onClearRack={() => p.onSelect(null)} lines={p.inventory.lines} warehouse={p.warehouse} selectedRack={selectedRack} onFocus={p.onLocate} orderName={p.order.name} onAddToOrder={lines => { try { const next = appendInventoryToOrder(p.order, lines); p.onOrder(next); setOrderPage(Math.floor(p.order.lines.length / 50)); setOrderSearch(''); p.notify(t('{0} artículos añadidos a la OT actual.', { 0: lines.length })); return true } catch (error) { p.notify((error as Error).message, true); return false } }}/></>}
      {p.mode === 'order' && <><div className="operations-actions"><button onClick={() => setOpenCandidate({ order: { name: 'OT sin título', lines: [] }, warehouseId: p.warehouse.id })}>{t("Nueva OT")}</button><button className={!p.order.lines.length ? "primary" : undefined} disabled={reading} onClick={() => orderPicker.current?.click()}>{t("Importar OT")}</button><button onClick={() => draftPicker.current?.click()}>{t("Abrir OT")}</button><button onClick={saveOrder}>{t("Guardar OT")}</button></div>
        <div className="order-name-row"><label>{t("Nombre de OT")}<input aria-label={t("Nombre de OT")} value={p.order.name} maxLength={200} onChange={e => p.onOrder({ ...p.order, name: e.target.value })}/></label><button onClick={() => addLine()}>{t("Añadir línea")}</button></div>
        <div className={`order-summary ${validation.errors.length || unplaced.length ? "needs-attention" : p.order.lines.length ? "is-ready" : ""}`}><strong>{p.order.lines.length}{" "}{t("líneas")}</strong><span>{formatQuantity(validation.lines.reduce((sum, l) => sum + l.quantity, 0))}{" "}{t("unidades")}</span><span>{validation.errors.length || unplaced.length ? t(`${validation.errors.length} errores · ${unplaced.length} ubicaciones sin colocar`) : p.order.lines.length ? t("✓ Lista para preparar el recorrido") : t("Pendiente de añadir líneas")}</span></div>
        {selectedRack && <div className="order-focus-notice"><span>{t('Las líneas de la estantería seleccionada están resaltadas.')}</span><button onClick={() => p.onSelect(null)}>{t('Quitar enfoque')}</button></div>}
        <input className="order-filter" aria-label={t("Buscar en la OT")} placeholder={t("Buscar en la OT…")} value={orderSearch} onChange={e => { setOrderSearch(e.target.value); setOrderPage(0) }}/>
        <div className="order-table-scroll"><table className="order-table"><thead><tr><th>{t("Línea")}</th><th>{t("Referencia")}</th><th>{t("Ubicación")}</th><th>{t("Cantidad")}</th><th>{t("Descripción")}</th><th>{t("OT de origen")}</th><th/></tr></thead><tbody>{shownOrder.map(({ line, index }) => {
          const error = validation.errors.find(e => e.row === index + 1)?.message, resolved = resolveLocation(p.warehouse, line.location), known = resolved.ok, focused = resolved.ok && resolved.rackId === selectedRack
          return <tr key={line.id} aria-selected={focused} className={[error || !known ? 'invalid-order-row' : '', focused ? 'focused-order-row' : ''].join(' ')}><td title={error || (!known ? t('Ubicación no definida en este almacén.') : '')}>{index + 1}{(error || !known) && <span aria-label={t("Revisar línea")}> !</span>}</td>{(['reference', 'location', 'quantityText', 'description', 'origin'] as const).map((key, c) => <td key={key}><input aria-label={`${t(['Referencia', 'Ubicación', 'Cantidad', 'Descripción', 'Origen'][c])} ${t('línea')} ${index + 1}`} inputMode={key === 'quantityText' ? 'decimal' : undefined} maxLength={4096} value={line[key]} onChange={e => updateLine(line.id, key, e.target.value)}/></td>)}<td><button aria-label={t(`Eliminar línea ${index + 1}`)} onClick={() => p.onOrder({ ...p.order, lines: p.order.lines.filter(l => l.id !== line.id) })}>×</button></td></tr>
        })}</tbody></table>{!p.order.lines.length && <p className="operations-empty">{t("Añade líneas, importa una OT o incorpora referencias desde Inventario.")}</p>}</div>
        <div className="operations-pagination"><button aria-label={t("Página anterior de OT")} disabled={!page} onClick={() => setOrderPage(page - 1)}>←</button><span>{filteredOrder.length}{" "}{t("de")}{" "}{p.order.lines.length}{" "}{t("líneas · Página")}{" "}{page + 1}</span><button aria-label={t("Página siguiente de OT")} disabled={(page + 1) * 50 >= filteredOrder.length} onClick={() => setOrderPage(page + 1)}>→</button></div><p className="operations-help">{t("El recorrido utiliza toda la OT, aunque haya un filtro. Guardar OT conserva también las líneas pendientes de corregir.")}</p>{validation.errors.length > 0 && <div className="order-errors" role="status">{validation.errors.slice(0, 5).map(e => <p key={`${e.row}-${e.message}`}>{t("Línea")}{" "}{e.row}: {e.message}</p>)}</div>}</>}
      {p.mode === 'route' && <RoutePanel onCoordinateDirty={setCoordinatesDirty} picking={picking} onMark={markPoint} onCancelMark={() => setPicking(null)} warehouse={p.warehouse} order={p.order} settings={p.settings} onSettings={p.onSettings} result={p.route} onResult={r => { setStep(0); p.onRoute(r) }} onFocus={p.onLocate} activeStop={step} onStep={setStep} onError={message => p.notify(message, true)}/>}
      {p.mode === 'reports' && <div className="report-options"><h2>{t("Preparar informe")}</h2><p>{t("El PDF incluye el plano y una tabla paginada. CSV permite trabajar con los datos en una hoja de cálculo.")}</p><label>{t("Contenido")}<select aria-label={t("Contenido del informe")} value={reportKind} onChange={e => setReportKind(e.target.value as typeof reportKind)}><option value="warehouse">{t("Plano del almacén")}</option><option value="inventory">{t("Inventario completo")}</option><option value="order">{t("OT completa")}</option><option value="route">{t("Recorrido calculado")}</option></select></label><p className="report-scope">{reportKind === 'warehouse' ? t(`${p.warehouse.racks.length} estanterías, ${p.warehouse.zones.length} zonas y ${p.warehouse.fixtures.length} elementos auxiliares.`) : reportKind === 'inventory' ? t(`${p.inventory.lines.length} líneas de inventario. Se incluyen también las ubicaciones desconocidas.`) : reportKind === 'order' ? t(`${p.order.lines.length} líneas de OT. ${validation.errors.length} errores por corregir.`) : p.route ? `${p.route.stops.length} ${t("paradas")} · ${lengthText(Math.round(p.route.distanceMm))}.` : t('Calcula primero el recorrido con los datos actuales.')}</p><div className="operations-actions"><button className="primary" disabled={exporting || reportKind === 'route' && !p.route} onClick={() => void exportReport(true)}>{t("Descargar PDF")}</button><button disabled={exporting || reportKind === 'warehouse' || reportKind === 'route' && !p.route} onClick={() => void exportReport(false)}>{t("Descargar CSV")}</button></div><p className="operations-help">{t("Se exportan todos los datos del contenido elegido, sin aplicar búsquedas ni filtros de pantalla. Los archivos se generan en este dispositivo.")}</p></div>}
    </section>
    {firstSeparator}<section id="consultation-plan" hidden={!planVisible} className="operations-plan" aria-label={t("Plano de consulta")}><div className="operations-plan-toolbar"><button className="plan-toggle" aria-label={t("Ocultar plano")} title={t("Ocultar plano")} aria-expanded={true} aria-controls="consultation-plan" onClick={() => { setPlanVisible(false); setPicking(null) }}><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><rect x="2" y="3" width="16" height="14" rx="2"/><path d="M12 3v14M8 8l-3 2 3 2"/></svg></button><div className="view-switch"><button aria-pressed={view === 'top'} onClick={() => setView('top')}>{t("Superior")}</button><button aria-pressed={view === 'iso'} onClick={() => setView('iso')}>{t("Isométrica")}</button></div><button onClick={() => setFit(n => n + 1)}>{t("Encuadrar")}</button></div><div className="canvas-body"><WarehouseViewport rackMatches={planVisible ? rackMatches : null} focusMode allowPointDrag={!coordinatesDirty} representation={p.representation} points={p.mode === "route" ? p.settings : undefined} picking={p.mode === "route" ? picking : null} onPoint={setPoint} onCancelPoint={() => setPicking(null)} validatePoint={point => pointIsFree(p.warehouse, point)} document={p.warehouse} selected={p.selected} view={view} fit={fit} tool="select" snapMm={0} onSelect={toggleFocus} onBegin={id => { toggleFocus(id); return false }} onMove={() => {}} onDragging={() => {}} onFeedback={(m, e) => p.notify(m, e)} location={p.location} locateRequest={p.locateRequest} route={p.mode === 'route' || p.mode === 'reports' && reportKind === 'route' ? p.route : undefined} activeStop={step}/>{p.location && <div className="location-focus-summary"><div><strong>{p.location.code}</strong><span>{t("Nivel")}{" "}{p.location.parts.level}{" "}{t("· Columna")}{" "}{p.location.parts.column}</span></div></div>}{filter?.active && <div className="inventory-plan-summary" role="status">{filter.resultCount === 0 ? t('Sin coincidencias en el inventario.') : filter.placedCount === 0 ? t('Hay resultados, pero sus ubicaciones no están representadas.') : t('Coincidencias en {0} estanterías', { 0: rackMatches?.length ?? 0 })}</div>}<div className={`canvas-help ${picking ? 'is-placing-point' : ''}`}>{picking ? <><strong>{t(picking === 'start' ? 'Selecciona la nueva casilla de inicio' : 'Selecciona la nueva casilla de destino')}</strong><span>{t('Clic para colocar · Escape para cancelar')}</span></> : t('Selecciona una estantería para relacionarla con los datos · Arrastra el fondo para mover la vista')}</div></div></section>
    {importing && <ImportDialog {...importing} template={p.warehouse.locationTemplate} hasExisting={importing.kind === 'inventory' ? !!p.inventory.lines.length : !!p.order.lines.length} onClose={() => setImporting(null)} onImport={(source, name, append) => {
      const lines = source.map(l => ({ ...l, id: uid() }))
      if (!validateDataLines(lines)) { p.notify(t('Los datos importados no tienen una estructura válida.'), true); return }
      if (importing.kind === 'inventory') p.onInventory({ name, lines })
      else {
        const next = { name: append && p.order.lines.length ? p.order.name : name, lines: [...(append ? p.order.lines : []), ...lines.map(l => ({ id: l.id, reference: l.reference, description: l.description, location: l.location, quantityText: formatQuantity(l.quantity), origin: l.origin || name }))] }
        if (!validateOrderDraft(next)) { p.notify(t('La OT supera los límites de líneas o longitud de campos.'), true); return }
        p.onOrder(next); setOrderPage(0)
      }
      setImporting(null); p.notify(t(`${lines.length} líneas importadas. Las ubicaciones se comprueban contra el almacén actual.`))
    }}/>} 
    {openCandidate && <div className="modal-shade"><section ref={candidateDialog} className="dialog" role="dialog" aria-modal="true" aria-labelledby="open-order-title"><h2 id="open-order-title">{t("Abrir OT")}</h2><p>{openCandidate.order.name} · {openCandidate.order.lines.length}{" "}{t("líneas.")}{" "}{p.orderDirty ? t('La OT actual tiene cambios sin guardar.') : t('Se sustituirá la OT actual.')}{openCandidate.warehouseId !== p.warehouse.id && t(' Procede de otro almacén: se volverán a comprobar sus ubicaciones.')}</p><div className="dialog-actions"><button autoFocus onClick={() => setOpenCandidate(null)}>{t("Cancelar")}</button>{p.orderDirty && <button onClick={saveOrder}>{t("Descargar OT actual")}</button>}<button className="primary" onClick={() => { p.onOpenOrder(openCandidate.order); setOrderPage(0); setOpenCandidate(null) }}>{t("Abrir esta OT")}</button></div></section></div>}
  </div>
}




