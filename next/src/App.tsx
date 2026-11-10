import { ElementList } from './editor/ElementList'
import { resizeElement } from './editor/elementResize'
import { APP_NAME, APP_ICON, APP_ICON_2X } from './brand'
import { formatMeasure as metres, useMeasurementUnit, setMeasurementUnit } from './measurements'
import { AppSettings } from './editor/AppSettings'
import type { PropertyTab } from './editor/PropertyTabs'
import { StartScreen } from './editor/StartScreen'
import { listRecentWarehouses, openRecentWarehouse, rememberWarehouse, type RecentWarehouse } from './persistence/recentWarehouses'
import { openLocalWarehouse, saveLocalWarehouse, type LocalFileHandle } from './persistence/localFiles'
import { detailedExampleWarehouse } from './warehouse/detailedExample'
import { t, useLanguage, setLanguage, locale } from './i18n'
import { FileMenu } from './editor/FileMenu'
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
const WarehouseViewport = lazy(() => import('./viewport/WarehouseViewport').then(module => ({ default: module.WarehouseViewport })))
import { allElements, assertDocument, createWarehouse, elementKind, elementName, exampleWarehouse, isRack, kindLabel, type ElementKind, type WarehouseDocument } from './warehouse/document'
import { readFile } from './persistence/browserFiles'
import { Properties, type DraftHandle } from './editor/Properties'
import { SpatialProperties } from './editor/SpatialProperties'
import { Icon } from './editor/Icon'
import { EditToolbar } from './editor/EditToolbar'
import { LocationSearch } from './editor/LocationSearch'
import { compileLocationFormat, DEFAULT_LOCATION_TEMPLATE, resolveLocation, type LocationFocus, type ResolvedLocation } from './warehouse/locations'
import { addElement, duplicateElement, moveElement, removeElement, rotateElement } from './editor/commands'
import { decode } from './persistence/documentCodec'
import { createHistory, pushHistory, redoHistory, undoHistory } from './editor/history'
const OperationsPanel = lazy(() => import('./operations/OperationsPanel').then(module => ({ default: module.OperationsPanel })))
import type { DataSet, OperationMode, OrderDraft, PendingEdit, RouteResult, RouteSettings, WorkspaceSnapshot } from './operations/types'
import { useRecovery } from './persistence/useRecovery'
import { RecoveryPrompt } from './persistence/RecoveryPrompt'
import './editor/WorkspaceShell.css'
import './App.css'
import { useResizableWorkspace } from './editor/ResizableWorkspace'
import type { WarehouseEdge } from './warehouse/resize'
import { resizeSession } from './editor/resizeSession'

const actionKinds: Record<ElementKind, string> = { rack: 'estantería', zone: 'zona', obstacle: 'obstáculo', table: 'mesa' }

export default function App() {
  const language = useLanguage()
  const unit = useMeasurementUnit()
  const [routeCoordinatesDirty, setRouteCoordinatesDirty] = useState(false)
  const [propertyTab, setPropertyTab] = useState<PropertyTab>('general')
  const [editorOpened, setEditorOpened] = useState(false)
  const [home, setHomeState] = useState(true), [recentRevision, setRecentRevision] = useState(0)
  const setHome = (value: boolean) => { setHomeState(value); if (!value) setEditorOpened(true) }
  const [continueLast, setContinueLast] = useState(() => { try { return localStorage.getItem('optiruta.start.continue') === 'true' } catch { return false } })
  const recentWarning = useRef('')
  const remember = (document: WarehouseDocument, filename?: string, handle?: LocalFileHandle) => {
    void rememberWarehouse(document, filename, handle).then(() => setRecentRevision(n => n + 1)).catch(() => { recentWarning.current = t('No se pudo guardar el reciente. Conserva el archivo del almacén.'); setNotice(recentWarning.current) })
  }
  const [history, setHistory] = useState(() => createHistory({ document: createWarehouse(), selected: null as string | null }))
  const doc = history.present.document, selected = history.present.selected
  const [saved, setSaved] = useState(() => JSON.stringify(doc))
  const [mode, setMode] = useState<OperationMode>('design'), [inventory, setInventory] = useState<DataSet>({ name: '', lines: [] })
  const [order, setOrder] = useState<OrderDraft>({ name: 'OT sin título', lines: [] }), [savedOrder, setSavedOrder] = useState(() => JSON.stringify(order))
  const [settings, setSettings] = useState<RouteSettings | null>(null), [calculated, setCalculated] = useState<{ signature: string; result: RouteResult } | null>(null)
  const [restoredEdit, setRestoredEdit] = useState<PendingEdit | undefined>(undefined)
  const [locationFocus, setLocationFocus] = useState<LocationFocus | null>(null), [locateRequest, setLocateRequest] = useState(0)
  const setSelected = (id: string | null) => { setPropertyTab('general'); setHistory(h => ({ ...h, present: { ...h.present, selected: id } })); setLocationFocus(null); setRestoredEdit(undefined) }
  const [tool, setTool] = useState<'select' | 'pan'>('select'), [snapStep, setSnapStep] = useState(-1), [dragging, setDragging] = useState(false)
  const snapMm = snapStep < 0 ? doc.gridSizeMm : snapStep
  const [view, setView] = useState<'top' | 'iso'>('iso'), [fit, setFit] = useState(0)
  const resizeEnabled = mode === "design"
  const [representation, setRepresentation] = useState<'blocks' | 'detailed'>(() => { try { return localStorage.getItem('optiruta.representation') === 'detailed' ? 'detailed' : 'blocks' } catch { return 'blocks' } })
  useEffect(() => { try { localStorage.setItem('optiruta.representation', representation) } catch { /* Preference remains available for this session. */ } }, [representation])
  const { ref: workspaceRef, style: workspaceStyle, firstSeparator, secondSeparator } = useResizableWorkspace({ kind: 'design', storageKey: 'optiruta.panels.design', labels: [t('Ajustar panel de elementos'), t('Ajustar panel de propiedades')] })
  const [notice, setNotice] = useState(t('Crea tu almacén o abre el ejemplo para explorar el editor.')), [error, setError] = useState('')
  const [pending, setPending] = useState<{ run: () => void } | null>(null), [draftPending, setDraftPending] = useState<{ run: () => void } | null>(null)
  const pendingAction = useRef(pending)
  useLayoutEffect(() => { pendingAction.current = pending }, [pending])
  const [draftDirty, setDraftDirty] = useState(false)
  const draft = useRef<DraftHandle | null>(null), picker = useRef<HTMLInputElement>(null)
  const fileBinding = useRef<{ generation: number; handle?: LocalFileHandle; name?: string }>({ generation: 0 })
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(doc) !== saved, elements = allElements(doc), element = elements.find(e => e.id === selected)
  const rack = element && isRack(element) ? element : undefined
  const orderDirty = JSON.stringify(order) !== savedOrder
  const signature = useMemo(() => JSON.stringify([doc, order, settings]), [doc, order, settings])
  const route = calculated?.signature === signature ? calculated.result : undefined
  const session = useMemo<WorkspaceSnapshot>(() => ({ warehouse: doc, selected, inventory, order, settings, mode, savedWarehouse: saved, savedOrder }), [doc, selected, inventory, order, settings, mode, saved, savedOrder])
  const recovery = useRecovery(session, () => draft.current?.dirty && mode === 'design' ? { warehouseId: doc.id, elementId: selected, values: draft.current.snapshot() } : undefined)
  const lastDraftKey = useRef('')
  const onDraftDirty = (value: boolean) => {
    setDraftDirty(value)
    const key = value ? JSON.stringify(draft.current?.snapshot()) : ''
    if (key !== lastDraftKey.current) { lastDraftKey.current = key; recovery.schedule() }
    if (!value && restoredEdit) setRestoredEdit(undefined)
  }
  const activeLocation = useMemo(() => {
    if (!rack || locationFocus?.rackId !== rack.id || selected !== rack.id) return undefined
    const code = compileLocationFormat(doc.locationTemplate ?? DEFAULT_LOCATION_TEMPLATE).compose(rack.code, locationFocus.level, String(locationFocus.column))
    const resolved = resolveLocation(doc, code)
    return resolved.ok ? resolved : undefined
  }, [doc, rack, locationFocus, selected])
  useLayoutEffect(() => {
    if (Number(doc.version) === 4) return
    // Preserve in-progress documents and history across the development schema update.
    const migrate = (value: typeof history.present) => ({ ...value, document: decode(JSON.stringify(value.document)) })
    // oxlint-disable-next-line react/set-state-in-effect -- One-time synchronization with an external Fast Refresh schema change.
    setHistory(h => ({ past: h.past.map(e => ({ ...e, value: migrate(e.value) })), present: migrate(h.present), future: h.future.map(e => ({ ...e, value: migrate(e.value) })) }))
    setSaved(current => JSON.stringify(decode(current)))
  }, [doc.version])
  const goHome = () => { setError(''); setHome(true) }
  const setStartupPreference = (value: boolean) => { setContinueLast(value); try { localStorage.setItem('optiruta.start.continue', String(value)) } catch { report(t('No se ha podido guardar la preferencia de inicio.')) } }
  const report = (message: string) => { setError(message); setNotice('') }
  const commit = (next: WarehouseDocument, label = 'Editar propiedades', selection = selected) => {
    assertDocument(next)
    if (selection !== selected) setPropertyTab('general')
    if (next.racks.some(r => { const old = doc.racks.find(old => old.id === r.id); return old && (r.contents ?? 'shelves') !== (old.contents ?? 'shelves') })) { setRepresentation('detailed'); setView('iso') }
    if (JSON.stringify(doc) !== JSON.stringify(next)) setHistory(h => pushHistory(h, { document: next, selected: selection }, label))
    setRestoredEdit(undefined); setError(''); setNotice(`${label}.`)
  }
  const protectDraft = (run: () => void) => { if (draft.current?.dirty) setDraftPending({ run }); else run() }
  const resizeDocument = (edge: WarehouseEdge, delta: number) => protectDraft(() => {
    try { const next = resizeSession(doc, settings, edge, delta, doc.gridSizeMm); commit(next.document, `Cambiar tamaño del almacén · ${edge}`); setSettings(next.settings) }
    catch (error) { report((error as Error).message) }
  })
  const focusLocation = (location: ResolvedLocation) => protectDraft(() => {
    setSelected(location.rackId); setPropertyTab('locations'); setLocationFocus({ rackId: location.rackId, level: location.parts.level, column: Number(location.parts.column) }); setLocateRequest(n => n + 1)
    setError(''); setNotice(t(`Localizada ${location.code} · Nivel ${location.parts.level} · Columna ${location.parts.column}.`))
  })
  const locate = (code: string) => {
    try {
      const location = resolveLocation(doc, code)
      if (!location.ok) { report(location.message); return false }
      focusLocation(location); return true
    } catch (e) { report((e as Error).message); return false }
  }
  const save = async (saveAs = false) => {
    if (saving) return false
    const binding = fileBinding.current, source = JSON.stringify(doc)
    setSaving(true)
    try {
      const result = await saveLocalWarehouse(doc, saveAs ? undefined : binding.handle, binding.name)
      if (!result || binding.generation !== fileBinding.current.generation) return false
      fileBinding.current = { generation: binding.generation, handle: result.handle, name: result.handle?.name ?? binding.name }
      remember(doc, result.handle?.name ?? binding.name, result.handle); setSaved(source); setError(''); setNotice(result.kind === 'file' ? t('Almacén guardado en el mismo archivo.') : t('Descarga generada: este navegador no permite actualizar el archivo original.'))
      return true
    } catch (error) { report((error as Error).message); return false }
    finally { setSaving(false) }
  }
  const replace = (next: WarehouseDocument, filename?: string, afterOpen?: () => void, rememberRecent = true) => protectDraft(() => {
    const run = () => {
      fileBinding.current = { generation: fileBinding.current.generation + 1, name: filename ? `${next.name}.optiruta.json` : undefined }
      setHistory(createHistory({ document: next, selected: null as string | null })); setSaved(JSON.stringify(next)); setFit(n => n + 1); setError('')
      setHome(false); setPropertyTab('general')
      afterOpen?.()
      if (filename && rememberRecent) remember(next, filename, fileBinding.current.handle)
      setNotice(filename ? t('Abierto: {0}. Los datos permanecen en este dispositivo.', { 0: filename }) : t('Almacén preparado. Añade una estantería para empezar.'))
    }
    if (dirty) setPending({ run }); else run()
  })
  const latestReplace = useRef(replace)
  useLayoutEffect(() => { latestReplace.current = replace })
  const openWarehouse = async () => {
    try { const opened = await openLocalWarehouse(); if (opened === undefined) picker.current?.click(); else if (opened) latestReplace.current(opened.document, opened.name, () => { fileBinding.current.handle = opened.handle; fileBinding.current.name = opened.name }) }
    catch (error) { report((error as Error).message) }
  }
  const openRecent = async (entry: RecentWarehouse, copy = false) => {
    try { const opened = await openRecentWarehouse(copy ? { ...entry, handle: undefined } : entry); latestReplace.current(opened.document, entry.filename ?? entry.name, () => { fileBinding.current.handle = opened.handle; fileBinding.current.name = entry.filename; if (copy) remember(opened.document, entry.filename, entry.handle) }, !copy) }
    catch (error) { report(error instanceof DOMException && error.name === 'NotFoundError' ? t('No se encuentra el archivo original. Puedes abrir la copia local.') : (error as Error).message) }
  }
  const startup = useRef(false)
  useEffect(() => {
    if (recovery.loading || startup.current) return
    startup.current = true
    if (!continueLast || recovery.pending) return
    // Startup never prompts for native-file permissions; the saved local copy opens instead.
    void listRecentWarehouses().then(entries => { if (entries[0]) void openRecent(entries[0], true) }).catch(() => {})
  }, [continueLast, recovery.pending, recovery.loading])
  const newlyAdded = (next: WarehouseDocument) => allElements(next).find(e => !elements.some(old => old.id === e.id))!.id
  const insert = (kind: ElementKind = 'rack') => protectDraft(() => {
    try { const next = addElement(doc, kind); commit(next, `Añadir ${actionKinds[kind]}`, newlyAdded(next)) } catch (e) { report((e as Error).message) }
  })
  const editSelected = (action: 'duplicate' | 'rotate' | 'delete') => protectDraft(() => {
    if (!selected || !element) return
    try {
      const label = actionKinds[elementKind(element)]
      if (action === 'duplicate') { const next = duplicateElement(doc, selected); commit(next, `Duplicar ${label}`, newlyAdded(next)) }
      if (action === 'rotate') commit(rotateElement(doc, selected), `Girar ${label}`)
      if (action === 'delete') commit(removeElement(doc, selected), `Eliminar ${label}`, null)
    } catch (e) { report((e as Error).message) }
  })
  const travel = (direction: 'undo' | 'redo') => protectDraft(() => {
    const entry = direction === 'undo' ? history.past.at(-1) : history.future[0]
    if (!entry) return
    const edge = entry.label.startsWith('Cambiar tamaño del almacén · ') ? entry.label.split(' · ')[1] as WarehouseEdge : undefined
    if (edge) {
      const delta = edge === 'left' || edge === 'right' ? entry.value.document.widthMm - doc.widthMm : entry.value.document.depthMm - doc.depthMm
      try { setSettings(resizeSession(doc, settings, edge, delta, doc.gridSizeMm).settings) }
      catch (error) { report((error as Error).message); return }
    }
    setHistory(h => direction === 'undo' ? undoHistory(h) : redoHistory(h))
    setError(''); setNotice(`${direction === 'undo' ? 'Deshecho' : 'Rehecho'}: ${entry.label}.`)
  })
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (home || e.defaultPrevented || e.isComposing || pending || draftPending || dragging || mode !== 'design' || recovery.pending) return
      if ((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]')) return
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase()
      if (mod && k === 'z') { e.preventDefault(); travel(e.shiftKey ? 'redo' : 'undo') }
      else if (mod && k === 'y') { e.preventDefault(); travel('redo') }
      else if (mod && k === 'd' && selected) { e.preventDefault(); editSelected('duplicate') }
      else if (!mod && !e.altKey && selected && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); editSelected('delete') }
      else if (!mod && !e.altKey && k === 'r' && selected && e.target instanceof HTMLCanvasElement) { e.preventDefault(); editSelected('rotate') }
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key)
  })
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => { if (dirty || draftDirty || orderDirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', before); return () => window.removeEventListener('beforeunload', before)
  }, [dirty, draftDirty, orderDirty])
  useEffect(() => { document.title = `${dirty || draftDirty || orderDirty ? '• ' : ''}${doc.name} · ${APP_NAME}` }, [doc.name, dirty, draftDirty, orderDirty])
  useEffect(() => {
    if (!pending && !draftPending) return
    const previous = document.activeElement as HTMLElement | null
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    buttons[0]?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setPending(null); setDraftPending(null) }
      if (e.key === 'Tab') {
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        if (e.shiftKey && index <= 0) { e.preventDefault(); buttons.at(-1)?.focus() }
        if (!e.shiftKey && index === buttons.length - 1) { e.preventDefault(); buttons[0]?.focus() }
      }
    }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); previous?.focus() }
  }, [pending, draftPending])
  return <div className="app-shell">
    <header className="app-header"><button className="brand" aria-label={t("Ir a Inicio")} title={t("Ir a Inicio")} aria-current={home ? "page" : undefined} onClick={goHome}><img className="brand-icon" src={APP_ICON} srcSet={`${APP_ICON} 1x, ${APP_ICON_2X} 2x`} alt="" width={36} height={36}/><strong>{APP_NAME}</strong></button><div className="document-title"><span>{doc.name}</span>{(dirty || draftDirty || orderDirty) && <span className="unsaved-dot" title={t("Cambios sin guardar")}/>}</div><span className="local-badge"><Icon name="lock" size={13}/>{t("Archivos locales")}</span><FileMenu><nav className="file-toolbar" aria-label={t("Archivo")}><div className="toolbar-group">
      <button onClick={() => replace(createWarehouse())}><Icon name="plus"/>{t("Nuevo almacén")}</button>
      <button onClick={() => { void openWarehouse() }}><Icon name="folder"/>{t("Abrir")}</button>
      <button disabled={saving} onClick={() => protectDraft(() => { void save() })}><Icon name="save"/>{t("Guardar almacén")}</button><button disabled={saving} onClick={() => protectDraft(() => { void save(true) })}><Icon name="save"/>{t("Guardar almacén como…")}</button>
      <input ref={picker} type="file" accept=".json,.optiruta.json" className="visually-hidden" aria-label={t("Abrir archivo de almacén")} onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
        try { const next = await readFile(file); latestReplace.current(next, file.name, () => { fileBinding.current.name = file.name }) } catch (ex) { report((ex as Error).message) }
      }}/></div><button className="text-button" onClick={() => replace(exampleWarehouse(), 'Almacén de ejemplo')}>{t("Abrir ejemplo")}<Icon name="arrow" size={13}/></button><button className="text-button" onClick={() => replace(detailedExampleWarehouse(), "Almacén detallado de escritorio", () => { setMode("design"); setRepresentation("detailed"); setView("iso") })}>{t("Abrir ejemplo detallado")}<Icon name="arrow" size={13}/></button></nav></FileMenu><AppSettings unit={unit} onUnit={setMeasurementUnit} blocked={draftDirty || routeCoordinatesDirty} language={language} onLanguage={setLanguage} continueLast={continueLast} onContinueLast={setStartupPreference}/></header>
    {home && <StartScreen hasSession={editorOpened} document={doc} dirty={dirty || draftDirty || orderDirty} onNew={() => replace(createWarehouse())} onOpen={() => { void openWarehouse() }} onExample={() => replace(detailedExampleWarehouse(), 'Almacén detallado de escritorio', () => { setMode('design'); setRepresentation('detailed'); setView('iso') })} onContinue={() => setHome(false)} onRecent={(entry, copy) => { void openRecent(entry, copy) }} revision={recentRevision} error={error}/>}
    <div className="editor-content" hidden={home}><nav className="mode-tabs" aria-label={t("Modo de trabajo")}>{([['design', 'Diseñar'], ['inventory', 'Inventario'], ['order', 'Órdenes de trabajo'], ['route', 'Recorridos'], ['reports', 'Informes']] as const).map(([key, label]) => <button key={key} aria-pressed={mode === key} onClick={() => protectDraft(() => setMode(key))}>{t(label)}</button>)}</nav><div className="mode-content" hidden={mode !== 'design'}>
    <EditToolbar tool={tool} onTool={setTool} snap={snapStep} gridSizeMm={doc.gridSizeMm} onSnap={setSnapStep} selected={!!element} disabled={dragging} onDuplicate={() => editSelected('duplicate')} onRotate={() => editSelected('rotate')} onDelete={() => editSelected('delete')} undoLabel={history.past.at(-1)?.label} redoLabel={history.future[0]?.label} onUndo={() => travel('undo')} onRedo={() => travel('redo')}/>
    <div className="workspace resizable-workspace" ref={workspaceRef} style={workspaceStyle}>
      <aside className="elements-panel" aria-label={t("Elementos del almacén")}><div className="panel-heading"><h2>{t("Almacén")}</h2><span className="counter">{elements.length}</span></div>
        <button className={`warehouse-row ${!selected ? 'active' : ''}`} onClick={() => protectDraft(() => setSelected(null))}><Icon name="grid"/><span><strong>{t("Plano general")}</strong><small>{metres(doc.widthMm)} × {metres(doc.depthMm)} {unit}</small></span></button>
        <div className="section-caption">{t("ELEMENTOS")}</div><button className="add-rack" onClick={() => insert()}><Icon name="plus" size={16}/>{t("Añadir estantería")}</button>
        <div className="spatial-additions">{(['zone', 'obstacle', 'table'] as const).map(kind => <button key={kind} aria-label={t({ zone: "Añadir zona", obstacle: "Añadir obstáculo", table: "Añadir mesa" }[kind])} onClick={() => insert(kind)}><Icon name={kind} size={15}/>{kindLabel(kind)}</button>)}</div>
        <ElementList key={doc.id} document={doc} selected={selected} onSelect={id => protectDraft(() => setSelected(id))}/>
        <div className="panel-footnote"><Icon name="lock" size={15}/><p>{t("Tu almacén se procesa en este dispositivo.")}</p></div>
      </aside>
      {firstSeparator}<main className="canvas-panel" aria-label={t("Plano del almacén")}><div className="canvas-toolbar"><div className="view-switch" aria-label={t("Vista del almacén")}><button aria-pressed={view === 'top'} onClick={() => setView('top')}><Icon name="grid" size={15}/>{t("Superior")}</button><button aria-pressed={view === 'iso'} onClick={() => setView('iso')}><Icon name="cube" size={16}/>{t("Isométrica")}</button></div><select aria-label={t("Representación del almacén")} value={representation} onChange={e => setRepresentation(e.target.value as "blocks" | "detailed")}><option value="blocks">{t("Bloques")}</option><option value="detailed">{t("Detallada")}</option></select><LocationSearch onLocate={locate}/><button className="fit-button" onClick={() => setFit(n => n + 1)}><Icon name="fit" size={16}/>{t("Encuadrar")}</button><div className="compact-elements"><select aria-label={t("Añadir otro elemento")} value="" onChange={e => { if (e.target.value) insert(e.target.value as ElementKind) }}><option value="">{t("Añadir…")}</option><option value="zone">{t("Zona")}</option><option value="obstacle">{t("Obstáculo")}</option><option value="table">{t("Mesa")}</option></select><button onClick={() => insert()}><Icon name="plus" size={14}/>{t("Estantería")}</button><select aria-label={t("Elemento seleccionado")} value={selected ?? ''} onChange={e => { const id = e.target.value || null; protectDraft(() => setSelected(id)) }}><option value="">{t("Plano general")}</option>{elements.map(e => <option key={e.id} value={e.id}>{e.code}{elementName(e) ? ` · ${elementName(e)}` : ''}</option>)}</select></div></div>
        <div className="canvas-body">{(!home || editorOpened) && <Suspense fallback={<div className="viewport-loading" role="status">{t("Cargando plano…")}</div>}><WarehouseViewport designFocus onBeginElementResize={() => { if (pending || draftPending) return false; if (draft.current?.dirty) { protectDraft(() => {}); return false } return true }} onElementResize={(id, edge, delta, step) => protectDraft(() => { try { commit(resizeElement(doc, id, edge, delta, step), 'Cambiar tamaño del elemento', id) } catch (error) { report((error as Error).message) } })} representation={representation} resizeEnabled={mode === "design" && resizeEnabled} validateResize={(edge, delta) => { try { resizeSession(doc, settings, edge, delta, doc.gridSizeMm); return true } catch { return false } }} onResize={resizeDocument} document={doc} selected={selected} view={view} fit={fit} location={activeLocation} locateRequest={locateRequest} tool={tool} snapMm={snapMm} onSelect={id => { if (id !== selected) protectDraft(() => setSelected(id)) }} onBegin={id => {
          if (pending || draftPending) return false
          if (draft.current?.dirty) { protectDraft(() => setSelected(id)); return false }
          setSelected(id); return true
        }} onMove={(id, x, y) => { try { commit(moveElement(doc, id, x, y), 'Mover elemento', id) } catch (e) { report((e as Error).message) } }} onDragging={setDragging} onFeedback={(message, isError) => { if (isError) report(message); else { setError(''); setNotice(message) } }}/></Suspense>}
          
          {!elements.length && <div className="empty-canvas"><span className="empty-symbol"><Icon name="rack" size={30}/></span><h2>{t("Un espacio por definir")}</h2><p>{t("Configura las medidas del almacén y añade tu primera estantería.")}</p><button className="primary" onClick={() => insert()}><Icon name="plus" size={16}/>{t("Añadir estantería")}</button></div>}
          {activeLocation && <div className="location-focus-summary"><Icon name="locate" size={19}/><div><strong>{activeLocation.code}</strong><span>{t("Nivel")}{" "}{activeLocation.parts.level}{" "}{t("· Columna")}{" "}{activeLocation.parts.column}{" "}{t("· Cota")}{" "}{activeLocation.elevationMm === null ? t("sin cota definida") : `${metres(activeLocation.elevationMm)} ${unit}`}</span></div><button aria-label={t("Quitar ubicación localizada")} onClick={() => setLocationFocus(null)}><Icon name="close" size={14}/></button></div>}<div className="axis-key"><b>Y</b><span>└</span><b>X</b></div><div className="canvas-help">{tool === 'select' ? t('Arrastra un elemento o un borde para editar el plano.') : t('Arrastrar: mover vista')}<span>·</span>{t("Espacio: mover vista")}<span>·</span>{t("Rueda: zoom")}{view === 'iso' && <><span>·</span>{t("Botón derecho: girar")}</>}</div>
        </div>
      </main>
      {secondSeparator}<aside className="properties-panel" aria-label={t("Propiedades")}><div className="panel-heading"><h2>{t("Propiedades")}</h2><Icon name={element ? elementKind(element) : 'grid'} size={17}/></div>{element && !isRack(element) ? <SpatialProperties key={`${unit}-${doc.id}-${JSON.stringify(element)}`} doc={doc} element={element} commit={commit} handle={draft} onDirty={onDraftDirty} recoveredDraft={restoredEdit?.warehouseId === doc.id && restoredEdit.elementId === selected ? restoredEdit.values : undefined}/> : <Properties tab={rack || propertyTab !== 'levels' ? propertyTab : 'general'} setTab={setPropertyTab} key={`${unit}-${doc.id}-${selected ?? 'warehouse'}-${JSON.stringify(rack ?? [doc.name, doc.widthMm, doc.depthMm, doc.gridSizeMm, doc.locationPolicy, doc.locationTemplate])}`} doc={doc} rack={rack} commit={commit} handle={draft} onDirty={onDraftDirty} recoveredDraft={restoredEdit?.warehouseId === doc.id && restoredEdit.elementId === selected ? restoredEdit.values : undefined} focused={activeLocation} onFocusLocation={focusLocation}/>}</aside>
    </div>
    </div>
    {mode !== 'design' && <Suspense fallback={<div className="viewport-loading" role="status">{t("Cargando sección…")}</div>}><OperationsPanel onCoordinateDirty={setRouteCoordinatesDirty} representation={representation} mode={mode} onMode={next => protectDraft(() => setMode(next))} warehouse={doc} inventory={inventory} onInventory={setInventory} order={order} onOrder={setOrder} orderDirty={orderDirty} onOrderSaved={() => setSavedOrder(JSON.stringify(order))} onOpenOrder={value => { setOrder(value); setSavedOrder(JSON.stringify(value)) }} settings={settings} onSettings={setSettings} route={route} onRoute={result => setCalculated({ signature, result })} selected={selected} onSelect={setSelected} onLocate={locate} location={activeLocation} locateRequest={locateRequest} notify={(message, isError) => { if (isError) report(message); else { setError(''); setNotice(message) } }}/></Suspense>}
    </div><footer className={`status-bar ${error ? 'has-error' : ''}`}><span role={error ? 'alert' : 'status'}>{t(error || notice)}</span><span className={`recovery-status ${recovery.status.error ? 'has-error' : ''}`} title={recovery.status.error || t('La copia automática permanece en este navegador; no sustituye los archivos descargados.')} role="status">{recovery.status.error ? t('Recuperación sin copia: guarda archivos') : recovery.status.savedAt ? `${t("Copia local actualizada")} · ${new Date(recovery.status.savedAt).toLocaleTimeString(locale(), { timeZone: 'Europe/Madrid' })}` : t('Recuperación local preparada')}</span><span className="status-meta">{draftDirty ? t('Propiedades pendientes') : dirty || orderDirty ? t('Cambios sin guardar') : t('Sin cambios pendientes')}<span className="status-dot"/>{unit}</span></footer>
    {recovery.loading && <div className="modal-shade recovery-loading" role="status">{t("Leyendo copia local…")}</div>}
    {recovery.pending && !recovery.loading && <RecoveryPrompt envelope={recovery.envelope} error={recovery.initialError} discard={recovery.discard} recover={() => { const data = recovery.envelope?.session; if (!data) return; setHistory(createHistory({ document: data.warehouse, selected: data.selected })); setInventory(data.inventory); setOrder(data.order); setSaved(data.savedWarehouse); setSavedOrder(data.savedOrder); setSettings(data.settings); setRestoredEdit(data.pendingEdit); setMode(data.pendingEdit ? 'design' : data.mode); setLocationFocus(null); setCalculated(null); setFit(n => n + 1); setHome(false); setNotice(t('Sesión recuperada. Las propiedades pendientes siguen sin aplicar.')); recovery.accept() }}/>}
    {draftPending && <div className="modal-shade"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="draft-title"><h2 id="draft-title">{t("Propiedades sin aplicar")}</h2><p>{t("Aplica las propiedades desde el panel antes de continuar, o descarta su edición.")}</p><div className="dialog-actions"><button autoFocus onClick={() => setDraftPending(null)}>{t("Volver a editar")}</button><button onClick={() => { draft.current?.reset(); const action = draftPending; setDraftPending(null); action.run() }}>{t("Descartar propiedades")}</button></div></section></div>}
    {pending && <div className="modal-shade"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="replace-title"><h2 id="replace-title">{t("¿Guardar el almacén actual?")}</h2><p>{t("Hay cambios sin guardar. Puedes guardar el archivo antes de continuar.")}</p><div className="dialog-actions"><button autoFocus onClick={() => setPending(null)}>{t("Cancelar")}</button><button onClick={() => { pending.run(); setPending(null) }}>{t("Descartar")}</button><button className="primary" disabled={saving} onClick={async () => { const action = pending; if (await save() && pendingAction.current === action) { action.run(); setPending(null) } }}>{t("Guardar y continuar")}</button></div></section></div>}
  </div>
}











