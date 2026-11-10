import { formatMeasure as metres, parseMeasure as parseMetres, getMeasurementUnit, convertMeasurementDraft } from '../measurements'
import { PropertyTabs, type PropertyTab } from './PropertyTabs'
import { t, useLanguage } from '../i18n'
import { useEffect, useState, type RefObject } from 'react'
import { elementHeight, uid, validateDocument, type Rack, type WarehouseDocument } from '../warehouse/document'
import { Icon } from './Icon'
import { compileLocationFormat, DEFAULT_LOCATION_TEMPLATE, type ResolvedLocation } from '../warehouse/locations'
import { LocationPreview } from './LocationPreview'
import { restoreFormDraft } from '../persistence/recovery'
export type DraftHandle = { dirty: boolean; reset: () => void; snapshot: () => Record<string, unknown> }
type Props = { tab: PropertyTab; setTab: (tab: PropertyTab) => void; doc: WarehouseDocument; rack?: Rack; commit: (d: WarehouseDocument) => void; handle: RefObject<DraftHandle | null>; onDirty: (dirty: boolean) => void; focused?: ResolvedLocation; onFocusLocation: (location: ResolvedLocation) => void; recoveredDraft?: Record<string, unknown> }
function draftValues(doc: WarehouseDocument, rack?: Rack) {
  return rack ? { ...rack, contents: rack.contents ?? "shelves", x: metres(rack.xMm), y: metres(rack.yMm), width: metres(rack.widthMm), depth: metres(rack.depthMm), height: rack.heightMm === null ? '' : metres(rack.heightMm), levels: rack.levels.map(l => ({ ...l, elevation: metres(l.elevationMm) })) } : { name: doc.name, width: metres(doc.widthMm), depth: metres(doc.depthMm), grid: metres(doc.gridSizeMm), locationPolicy: doc.locationPolicy ?? "strict", locationTemplate: doc.locationTemplate ?? DEFAULT_LOCATION_TEMPLATE }
}
export function Properties({ tab, setTab, doc, rack, commit, handle: draftRef, onDirty, focused, onFocusLocation, recoveredDraft }: Props) {
  useLanguage()
  const [base] = useState(() => draftValues(doc, rack))
  const initial = JSON.stringify(base), [values, setValues] = useState<Record<string, unknown>>(() => restoreFormDraft(base, convertMeasurementDraft(recoveredDraft))), [formError, setFormError] = useState('')
  const changed = JSON.stringify(values) !== initial
  const field = (key: string) => String(values[key] ?? (key === 'contents' ? 'shelves' : ''))
  const change = (key: string, value: unknown) => { setValues(v => ({ ...v, [key]: value })); setFormError('') }
  const reset = () => { setValues(base); setFormError(''); onDirty(false) }
  const apply = () => {
    try {
      let next: WarehouseDocument
      if (rack) {
        const levels = values.levels as Array<{ id: string; code: string; elevation: string }>
        const updated: Rack = { ...rack, contents: field("contents") as Rack["contents"], code: field('code').trim().toUpperCase(), alias: field('alias').trim(), color: field('color'), xMm: parseMetres(field('x')), yMm: parseMetres(field('y')), widthMm: parseMetres(field('width')), depthMm: parseMetres(field('depth')), heightMm: field('height').trim() ? parseMetres(field('height')) : null, rotation: Number(values.rotation) as Rack['rotation'], columns: Number(values.columns), access: values.access as Rack['access'], reverse: Boolean(values.reverse), levels: levels.map(l => ({ id: l.id, code: l.code, elevationMm: parseMetres(l.elevation) })) }
        next = { ...doc, racks: doc.racks.map(r => r.id === rack.id ? updated : r) }
      } else next = { ...doc, name: field('name').trim(), widthMm: parseMetres(field('width')), depthMm: parseMetres(field('depth')), gridSizeMm: parseMetres(field('grid')), locationPolicy: field("locationPolicy") as WarehouseDocument["locationPolicy"], locationTemplate: compileLocationFormat(field('locationTemplate')).source }
      const errors = validateDocument(next); if (errors.length) throw new Error(errors.join(' '))
      commit(next); setValues(draftValues(next, rack ? next.racks.find(r => r.id === rack.id) : undefined)); setFormError('')
    } catch (e) { setFormError((e as Error).message) }
  }
  useEffect(() => { draftRef.current = { dirty: changed, reset, snapshot: () => ({ ...values, __unit: getMeasurementUnit() }) }; onDirty(changed); return () => { draftRef.current = null } })
  const input = (key: string, label: string, unit?: string) => <label className="field"><span>{label}</span><div className="input-wrap"><input aria-label={label} value={field(key)} onChange={e => change(key, e.target.value)} inputMode={unit ? 'decimal' : undefined} aria-invalid={!!formError}/>{unit && <span aria-hidden="true">{unit}</span>}</div></label>
  const levels = (values.levels ?? []) as Array<{ id: string; code: string; elevation: string }>
  let templateFeedback = '', templateInvalid = false
  if (!rack) {
    try { templateFeedback = t(`Ejemplo: ${compileLocationFormat(field('locationTemplate')).compose('A5', '01', '10')}`) }
    catch (e) { templateFeedback = (e as Error).message; templateInvalid = true }
  }
  return <form className="properties-form" onSubmit={e => { e.preventDefault(); apply() }}><PropertyTabs value={tab} onChange={setTab} rack={!!rack}/><div className="properties-scroll">
    <div className="property-title"><span className="eyebrow">{rack ? t('ESTANTERÍA') : t('CONFIGURACIÓN')}</span><h3>{rack ? rack.code : t('Plano general')}</h3><p>{rack ? t('Dimensiones y ubicaciones de la sección.') : t('Define el espacio disponible para tu almacén.')}</p></div>
    <section role="tabpanel" id="property-page-general" aria-labelledby="property-tab-general" hidden={tab !== 'general'}>{rack ? <><div className="form-pair">{input('code', t('Código'))}{input('alias', t('Nombre opcional'))}</div><label className="color-field"><span>{t("Color de sección")}</span><input type="color" aria-label={t("Color de sección")} value={field('color')} onChange={e => change('color', e.target.value)}/></label></> : input('name', t('Nombre del almacén'))}
    <fieldset><legend>{t("Dimensiones")}</legend><div className="form-pair">{input('width', t('Ancho'), getMeasurementUnit())}{input('depth', t('Fondo'), getMeasurementUnit())}</div>{rack && input('height', t('Altura real (opcional)'), getMeasurementUnit())}{!rack && input('grid', t('Tamaño de cuadrícula'), getMeasurementUnit())}</fieldset>
    {rack && <><fieldset><legend>{t("Posición")}</legend><div className="form-pair">{input('x', t('Coordenada X'), getMeasurementUnit())}{input('y', t('Coordenada Y'), getMeasurementUnit())}</div><label className="field"><span>{t("Giro")}</span><select aria-label={t("Giro")} value={field('rotation')} onChange={e => change('rotation', e.target.value)}>{[0, 90, 180, 270].map(n => <option key={n} value={n}>{n}°</option>)}</select></label></fieldset>
</>}
    {rack && <fieldset><legend>{t("Vista detallada")}</legend><label className="field"><span>{t("Contenido ilustrativo")}</span><select aria-label={t("Contenido ilustrativo")} value={field('contents')} onChange={e => change('contents', e.target.value)}><option value="shelves">{t("Solo baldas")}</option><option value="cartons">{t("Cajas de cartón")}</option><option value="pallets">{t("Palets con cajas")}</option><option value="bins">{t("Cajas pequeñas / gavetas")}</option></select></label><p className="field-help">{t("Representación ilustrativa; no indica existencias reales.")}</p>{!levels.length && <p className="field-help">{t("Sin niveles configurados se dibujan baldas orientativas. No crean ubicaciones.")}</p>}</fieldset>}
    </section><section role="tabpanel" id="property-page-locations" aria-labelledby="property-tab-locations" hidden={tab !== 'locations'}>{!rack && <fieldset><legend>{t("Códigos de ubicación")}</legend>{input('locationTemplate', t('Formato de ubicación'))}<label className="field"><span>{t("Reconocimiento de ubicaciones")}</span><select aria-label={t("Reconocimiento de ubicaciones")} value={field("locationPolicy") || "strict"} onChange={e => change("locationPolicy", e.target.value)}><option value="strict">{t("Niveles configurados")}</option><option value="section-column">{t("Sección y columna (compatible con escritorio)")}</option></select></label><p className={`template-feedback ${templateInvalid ? 'invalid' : ''}`} aria-live="polite">{templateFeedback}</p><div className="template-presets"><button type="button" onClick={() => change('locationTemplate', '{S}{N}{C}')}>{t("Sin separadores")}</button><button type="button" onClick={() => change('locationTemplate', '{S}-{N}-{C}')}>{t("Con guiones")}</button></div><p className="field-help">{t('{S} sección · {N} nivel · {C} columna.')}<br/>{t("Puedes reordenarlos y añadir separadores.")}</p><details className="template-help"><summary>{t("Otros formatos")}</summary><p>{t('{L} letra y {E} dígito sustituyen a {S}. {*} omite texto adicional al leer un código.')}<br/>{t("Ejemplo:")}{" "}{'{*}{L}-{E}/{N}/{C}'}.</p></details></fieldset>}
    {rack && <>
      <fieldset><legend>{t("Ubicaciones")}</legend><div className="form-pair">{input('columns', t('Columnas'))}<label className="field"><span>{t("Acceso local")}</span><select aria-label={t("Acceso local")} value={field('access')} onChange={e => change('access', e.target.value)}><option value="front">{t("Frontal")}</option><option value="back">{t("Trasero")}</option><option value="left">{t("Izquierda")}</option><option value="right">{t("Derecha")}</option></select></label></div><label className="check-field"><input type="checkbox" checked={Boolean(values.reverse)} onChange={e => change('reverse', e.target.checked)}/>{t("Invertir numeración")}</label><p className="field-help">{t("La cara de acceso gira con la estantería. A 0°, Frontal es el borde inferior del plano. Las marcas muestran el sentido de las columnas.")}</p></fieldset>
      <LocationPreview key={`${rack.id}-${focused?.parts.level ?? 'none'}`} doc={doc} rack={rack} pending={changed} focused={focused} onFocus={onFocusLocation}/>
    </>}</section><section role="tabpanel" id="property-page-levels" aria-labelledby="property-tab-levels" hidden={tab !== 'levels'}>{rack && <>
      <fieldset><legend>{t("Niveles")}{" "}<span className="legend-count">{levels.length}</span></legend><div className="levels-heading"><span>{t("Código")}</span><span>{t("Cota ({0})", { 0: getMeasurementUnit() })}</span></div>{levels.map((level, i) => <div className="level-row" key={level.id}><input aria-label={t(`Código nivel ${i + 1}`)} value={level.code} maxLength={2} onChange={e => change('levels', levels.map((l, j) => j === i ? { ...l, code: e.target.value } : l))}/><input aria-label={t(`Cota nivel ${i + 1}`)} value={level.elevation} inputMode="decimal" onChange={e => change('levels', levels.map((l, j) => j === i ? { ...l, elevation: e.target.value } : l))}/><button type="button" className="icon-button" aria-label={t(`Eliminar nivel ${i + 1}`)} onClick={() => change('levels', levels.filter((_, j) => i !== j))}><Icon name="close" size={14}/></button></div>)}<button type="button" className="level-add" onClick={() => {
        const code = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0')).find(c => !levels.some(l => l.code === c))
        if (code === undefined) { setFormError(t('Se permiten hasta 100 niveles.')); return }
        change('levels', [...levels, { id: uid(), code, elevation: '' }])
      }}><Icon name="plus" size={14}/>{t("Añadir nivel")}</button><p className="field-help">{t("Las cotas se miden desde el suelo. Los niveles no representan existencias.")}</p></fieldset>

    </>}
    </section><div hidden={tab !== 'general'}>{!rack && <div className="property-note"><Icon name="grid" size={18}/><p>{t("Medidas reales en la unidad seleccionada.")}<br/>{t("La cuadrícula sirve de referencia visual.")}</p></div>}
    {rack && !field('height').trim() && <p className="field-help">{t("Altura ilustrativa: {0} {1}. No se guarda como medida real.", { 0: metres(elementHeight({ ...rack, heightMm: null, contents: field("contents") as Rack["contents"] })), 1: getMeasurementUnit() })}</p>}
    </div>{formError && <p className="form-error" role="alert">{t(formError)}</p>}
  </div><div className="property-actions"><span>{changed ? t('Tienes cambios por aplicar') : t('Propiedades actualizadas')}</span><div><button type="button" disabled={!changed} onClick={reset}>{t("Cancelar")}</button><button type="submit" className="primary" disabled={!changed}>{t("Aplicar")}</button></div></div></form>
}

