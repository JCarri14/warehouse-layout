import { formatMeasure, lengthText, parseMeasure as parseMetres, useMeasurementUnit } from '../measurements'
import { t, useLanguage, getLanguage } from '../i18n'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { type WarehouseDocument } from '../warehouse/document'
import { resolveLocation } from '../warehouse/locations'
import { draftToLines, formatQuantity } from './imports'
import { automaticRouteCellSize, defaultRouteSettings, pointIsFree } from './routing'
import type { OrderDraft, RouteResult, RouteSettings } from './types'
import './RoutePanel.css'

type Props = {
  picking?: "start" | "end" | null; onMark: (kind: "start" | "end") => void; onCancelMark: () => void; onCoordinateDirty?: (dirty: boolean) => void; warehouse: WarehouseDocument; order: OrderDraft; settings: RouteSettings | null;
  onSettings: (settings: RouteSettings) => void; result?: RouteResult;
  onResult: (result: RouteResult) => void; onFocus: (code: string) => void;
  activeStop: number; onStep: (index: number) => void; onError: (message: string) => void;
}
type Draft = { startX: string; startY: string; endX: string; endY: string; cell: string; closed: boolean }
type FieldErrors = Partial<Record<keyof Draft, string>>
const metres = formatMeasure
const draftFor = (s: RouteSettings): Draft => ({ startX: formatMeasure(s.start.xMm), startY: formatMeasure(s.start.yMm), endX: formatMeasure(s.end.xMm), endY: formatMeasure(s.end.yMm), cell: String(s.cellSizeMm), closed: s.returnToStart })
const blank: Draft = { startX: '', startY: '', endX: '', endY: '', cell: '500', closed: true }
const distance = lengthText

export function RoutePanel({ picking, onMark, onCancelMark, onCoordinateDirty, warehouse, order, settings, onSettings, result, onResult, onFocus, activeStop, onStep, onError }: Props) {
  useLanguage()
  const unit = useMeasurementUnit()
  const defaults = useMemo(() => {
    try { return { value: settings ? { ...settings, cellSizeMm: automaticRouteCellSize(warehouse) } : defaultRouteSettings(warehouse), error: '' } }
    catch (error) { return { value: null, error: error instanceof Error ? error.message : t('No hay un inicio libre.') } }
  }, [warehouse, settings])
  const effective = defaults.value
  const settingsKey = JSON.stringify([effective, unit])
  const [form, setForm] = useState<{ key: string; draft: Draft; errors: FieldErrors }>(() => ({ key: settingsKey, draft: effective ? draftFor(effective) : blank, errors: {} }))
  const draft = form.key === settingsKey ? form.draft : effective ? draftFor(effective) : blank
  const fieldErrors = form.key === settingsKey ? form.errors : {}
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [notice, setNotice] = useState({ key: '', text: '' })
  const worker = useRef<Worker | null>(null)
  const runId = useRef(0)
  const callbacks = useRef({ onResult, onError })
  // Content identity, rather than render identity, prevents local status updates from cancelling work.
  const inputKey = useMemo(() => JSON.stringify({ warehouse, order, effective }), [warehouse, order, effective])
  const latestKey = useRef(inputKey)
  const busy = busyKey === inputKey
  const status = notice.key === inputKey ? notice.text : busyKey ? t('Cálculo cancelado: han cambiado los datos o las opciones.') : ''
  const setStatus = (text: string) => setNotice({ key: inputKey, text })
  useLayoutEffect(() => { callbacks.current = { onResult, onError }; latestKey.current = inputKey }, [onResult, onError, inputKey])
  useEffect(() => {
    runId.current++
    worker.current?.terminate(); worker.current = null
    // A changed input cancels this external worker session, including its displayed progress.
    // oxlint-disable-next-line react/set-state-in-effect
    setBusyKey(null)
    setNotice({ key: inputKey, text: '' })
    // The reference intentionally tracks the currently active worker, which may be created after this effect.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    return () => { runId.current++; worker.current?.terminate(); worker.current = null }
  }, [inputKey])
  const validation = useMemo(() => {
    try {
      const parsed = draftToLines(order.lines, warehouse.locationTemplate)
      const errors = parsed.errors.map(issue => t(`Fila ${issue.row}: ${issue.message}`))
      parsed.lines.forEach((line, index) => {
        const location = resolveLocation(warehouse, line.location)
        if (!location.ok) errors.push(`${line.location} (${line.reference || `fila ${index + 1}`}): ${location.message}`)
      })
      return { lines: parsed.lines, errors }
    } catch (error) { return { lines: [], errors: [error instanceof Error ? error.message : t('La OT no es válida.')] } }
  }, [order, warehouse])
  const dirty = !effective || JSON.stringify(draft) !== JSON.stringify(draftFor(effective))
  useEffect(() => { onCoordinateDirty?.(dirty) }, [dirty, onCoordinateDirty])
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setForm({ key: settingsKey, draft: { ...draft, [key]: value }, errors: { ...fieldErrors, [key]: undefined } })
  const apply = () => {
    const errors: FieldErrors = {}, values = { startX: 0, startY: 0, endX: 0, endY: 0 }
    for (const key of ['startX', 'startY', 'endX', 'endY'] as const) {
      try { values[key] = parseMetres(draft[key]) } catch (error) { errors[key] = error instanceof Error ? error.message : t('Medida inválida.') }
    }
    const size = automaticRouteCellSize(warehouse)
    if (!Number.isSafeInteger(size) || size < 1) errors.cell = t('Selecciona un tamaño de celda válido.')
    if (!errors.startX && !errors.startY && !pointIsFree(warehouse, { xMm: values.startX, yMm: values.startY })) errors.startX = t('El inicio debe estar dentro del almacén, en una zona libre.')
    if (!errors.endX && !errors.endY && !pointIsFree(warehouse, { xMm: values.endX, yMm: values.endY })) errors.endX = t('El destino debe estar dentro del almacén, en una zona libre.')
    setForm({ key: settingsKey, draft, errors })
    if (Object.keys(errors).length) return
    onSettings({ start: { xMm: values.startX, yMm: values.startY }, end: { xMm: values.endX, yMm: values.endY }, returnToStart: draft.closed, cellSizeMm: size })
    setStatus(t('Opciones aplicadas. Calcula la ruta para actualizar el recorrido.'))
  }
  const cancel = () => { runId.current++; worker.current?.terminate(); worker.current = null; setBusyKey(null); setStatus(t('Cálculo cancelado.')) }
  const calculate = () => {
    if (!effective || dirty || !validation.lines.length || validation.errors.length) return
    worker.current?.terminate()
    const id = ++runId.current, key = inputKey
    let instance: Worker
    try { instance = new Worker(new URL('./route.worker.ts', import.meta.url), { type: 'module' }) }
    catch { const message = t('No se pudo iniciar el cálculo. Vuelve a intentarlo.'); setStatus(message); onError(message); return }
    worker.current = instance; setBusyKey(inputKey); setStatus(t('Calculando los pasillos y el orden de recogida…'))
    const finish = () => { instance.terminate(); if (worker.current === instance) worker.current = null; setBusyKey(null) }
    instance.onmessage = (event: MessageEvent<{ ok: true; result: RouteResult } | { ok: false; message: string }>) => {
      if (id !== runId.current || key !== latestKey.current) { instance.terminate(); return }
      finish()
      if (event.data.ok) { callbacks.current.onResult(event.data.result); setStatus(t('Ruta calculada.')) }
      else { setStatus(event.data.message); callbacks.current.onError(event.data.message) }
    }
    instance.onerror = () => {
      if (id !== runId.current || key !== latestKey.current) { instance.terminate(); return }
      finish(); const message = t('El cálculo no pudo completarse. Revisa las opciones o vuelve a intentarlo.'); setStatus(message); callbacks.current.onError(message)
    }
    try { instance.postMessage({ warehouse, lines: validation.lines, settings: effective, language: getLanguage() }); if (!settings || settings.cellSizeMm !== effective.cellSizeMm) onSettings(effective) }
    catch { finish(); const message = t('No se pudieron preparar los datos para el cálculo.'); setStatus(message); onError(message) }
  }
  const focusStop = (index: number) => {
    const stop = result?.stops[index]
    if (!stop) return
    onStep(index)
    if (stop.lines[0]) onFocus(stop.lines[0].location)
  }
  const current = result?.stops[activeStop]
  const field = (key: 'startX' | 'startY' | 'endX' | 'endY', label: string) => <label className="route-field" key={key}>{label}<span className="route-input-unit"><input aria-label={label} inputMode="decimal" value={draft[key]} onChange={event => update(key, event.target.value)} aria-invalid={!!fieldErrors[key]} aria-describedby={fieldErrors[key] ? `route-error-${key}` : undefined} /><span>{unit}</span></span>{fieldErrors[key] && <small id={`route-error-${key}`} className="route-field-error">{t(fieldErrors[key]!)}</small>}</label>
  return <section className="route-panel" aria-label={t("Cálculo y recorrido de ruta")}>
    <header className="route-heading"><div><h2>{t("Preparar la ruta")}</h2><p>{t("Recoge la OT por los pasillos del almacén.")}</p></div><span className="route-count">{order.lines.length}{" "}{t("líneas")}</span></header>
    <div className="route-point-actions"><button disabled={dirty} aria-pressed={picking === "start"} onClick={() => onMark("start")}>{t(settings ? "Cambiar inicio" : "Marcar inicio")}</button><button disabled={dirty} aria-pressed={picking === "end"} onClick={() => onMark("end")}>{t(settings && !settings.returnToStart ? "Cambiar destino" : "Marcar destino")}</button>{picking && <button onClick={onCancelMark}>{t("Cancelar selección")}</button>}</div>{picking && <p className="route-help" role="status">{t("Mueve el cursor para previsualizar la casilla y pulsa para colocar el punto. Escape cancela.")}</p>}<details className="route-options">
      <summary>{t("Inicio, destino y precisión")}</summary>
      <p className="route-help">{t("Coordenadas en la unidad seleccionada. Puedes usar coma o punto decimal.")}</p>
      <div className="route-fields">{field('startX', t('Inicio · X'))}{field('startY', t('Inicio · Y'))}{field('endX', t('Destino · X'))}{field('endY', t('Destino · Y'))}</div>
      <label className="route-check"><input type="checkbox" checked={draft.closed} onChange={event => update('closed', event.target.checked)} />{t("Volver al punto de inicio")}</label>
      {draft.closed && <p className="route-help">{t("El recorrido termina en el inicio. El destino se guarda para rutas abiertas.")}</p>}
      <p className="route-help">{t("Precisión automática del cálculo. La cuadrícula se configura en Diseñar.")}</p>
      <button type="button" className="route-secondary" onClick={apply} disabled={!dirty}>{t("Aplicar opciones")}</button>
    </details>
    {defaults.error && <p className="route-alert" role="alert">{t(defaults.error)}</p>}
    {!order.lines.length && <p className="route-empty">{t("Añade piezas a la OT antes de calcular una ruta.")}</p>}
    {validation.errors.length > 0 && <details className="route-alert" open><summary>{validation.errors.length} {validation.errors.length === 1 ? t('error en la OT') : t('errores en la OT')}</summary><p>{t("Corrige estas líneas en la pestaña OT.")}</p><ul>{validation.errors.slice(0, 12).map((error, i) => <li key={i}>{t(error)}</li>)}</ul>{validation.errors.length > 12 && <p>{t("Y {0} errores más.", { 0: validation.errors.length - 12 })}</p>}</details>}
    <div className="route-actions"><button type="button" className="route-primary" onClick={calculate} disabled={busy || dirty || !effective || !validation.lines.length || validation.errors.length > 0}>{busy ? t('Calculando…') : t('Calcular ruta')}</button>{busy && <button type="button" className="route-secondary" onClick={cancel}>{t("Cancelar")}</button>}</div>
    {dirty && <button onClick={() => effective && setForm({ key: settingsKey, draft: draftFor(effective), errors: {} })}>{t("Cancelar opciones")}</button>}{dirty && <p className="route-help">{t("Aplica las opciones antes de calcular.")}</p>}
    <p className="route-status" role="status" aria-live="polite">{t(status)}</p>
    {result && <div className="route-results">
      <div className="route-summary"><strong>{distance(result.distanceMm)}<span>{t("Distancia total")}</span></strong><strong>{result.stops.length}<span>{t("Paradas de recogida")}</span></strong></div>
      <p className="route-method">{result.exact ? t('Orden óptimo en la malla') : t('Orden aproximado en la malla')}{" "}{t("· celda de")}{" "}{metres(result.cellSizeMm)} {unit}</p>
      <details className="route-warnings"><summary>{t("Cómo interpretar la ruta")}</summary><ul>{result.warnings.map((warning, i) => <li key={i}>{t(warning)}</li>)}</ul></details>
      {result.stops.length > 0 && <><h3>{t("Recorrer las paradas")}</h3><div className="route-navigation"><button type="button" className="route-secondary" onClick={() => focusStop(activeStop - 1)} disabled={activeStop <= 0}>{t("Parada anterior")}</button><button type="button" className="route-secondary" onClick={() => focusStop(activeStop + 1)} disabled={activeStop >= result.stops.length - 1}>{t("Siguiente parada")}</button></div><button type="button" className="route-secondary route-view" onClick={() => focusStop(activeStop)} disabled={!current}>{t("Ver parada")}{current ? ` ${activeStop + 1}` : ''}</button>
      <ol className="route-stops">{result.stops.map((stop, index) => <li key={index} className={activeStop === index ? 'is-active' : ''}><button type="button" className="route-stop-heading" onClick={() => focusStop(index)} aria-current={activeStop === index ? 'step' : undefined}><span className="route-stop-number">{index + 1}</span><span>{t("Parada")}{" "}{index + 1}<small>{distance(stop.distanceMm)}{" "}{t("acumulados")}</small></span><span>{stop.lines.length} {stop.lines.length === 1 ? t('línea') : t('líneas')}</span></button><ul className="route-stop-lines">{stop.lines.map((line, lineIndex) => <li key={`${line.id}-${lineIndex}`}><div><strong>{line.reference || line.description}</strong><span>{formatQuantity(line.quantity)}{" "}{t("uds.")}</span></div>{line.description && line.reference && <p>{line.description}</p>}<p><button type="button" className="route-location" onClick={() => { onStep(index); onFocus(line.location) }}>{line.location}</button>{line.origin && <span> · {line.origin}</span>}</p></li>)}</ul></li>)}</ol></>}
    </div>}
  </section>
}
export default RoutePanel


