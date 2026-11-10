import { formatMeasure as metres, parseMeasure as parseMetres, getMeasurementUnit, convertMeasurementDraft } from '../measurements'
import { t, useLanguage } from '../i18n'
import { useEffect, useState, type RefObject } from 'react'
import { kindLabel, type WarehouseDocument, type WarehouseZone, type WarehouseFixture } from '../warehouse/document'
import { replaceElement } from './commands'
import { Icon } from './Icon'
import type { DraftHandle } from './Properties'
import { restoreFormDraft } from '../persistence/recovery'

type SpatialElement = WarehouseZone | WarehouseFixture
type Props = { doc: WarehouseDocument; element: SpatialElement; commit: (doc: WarehouseDocument) => void; handle: RefObject<DraftHandle | null>; onDirty: (dirty: boolean) => void; recoveredDraft?: Record<string, unknown> }
function fields(element: SpatialElement) {
  return { code: element.code, name: element.name, color: element.color, x: metres(element.xMm), y: metres(element.yMm), width: metres(element.widthMm), depth: metres(element.depthMm), height: element.kind === 'zone' ? '' : metres(element.heightMm), rotation: String(element.rotation) }
}
export function SpatialProperties({ doc, element, commit, handle: draftRef, onDirty, recoveredDraft }: Props) {
  useLanguage()
  const [base] = useState(() => fields(element))
  const [values, setValues] = useState(() => restoreFormDraft(base, convertMeasurementDraft(recoveredDraft))), [error, setError] = useState('')
  const dirty = JSON.stringify(base) !== JSON.stringify(values), zone = element.kind === 'zone'
  const change = (key: keyof typeof values, value: string) => { setValues(v => ({ ...v, [key]: value })); setError('') }
  const reset = () => { setValues(base); setError(''); onDirty(false) }
  useEffect(() => { draftRef.current = { dirty, reset, snapshot: () => ({ ...values, __unit: getMeasurementUnit() }) }; onDirty(dirty); return () => { draftRef.current = null } })
  const input = (key: keyof typeof values, label: string, unit = false) => <label className="field"><span>{label}</span><div className="input-wrap"><input aria-label={label} value={values[key]} inputMode={unit ? 'decimal' : undefined} onChange={e => change(key, e.target.value)} aria-invalid={!!error}/>{unit && <span aria-hidden="true">{getMeasurementUnit()}</span>}</div></label>
  return <form className="properties-form" onSubmit={e => {
    e.preventDefault()
    try {
      const common = { ...element, code: values.code.trim(), name: values.name.trim(), color: values.color, xMm: parseMetres(values.x), yMm: parseMetres(values.y), widthMm: parseMetres(values.width), depthMm: parseMetres(values.depth), rotation: Number(values.rotation) as SpatialElement['rotation'] }
      const updated: SpatialElement = common.kind === 'zone' ? common : { ...common, heightMm: parseMetres(values.height) }
      const next = replaceElement(doc, updated)
      commit(next); setValues(fields(updated)); setError('')
    } catch (ex) { setError((ex as Error).message) }
  }}><div className="properties-scroll">
    <div className="property-title"><span className="eyebrow">{kindLabel(element.kind).toUpperCase()}</span><h3>{element.code}</h3><p>{zone ? t('Superficie de suelo que identifica un área.') : t('Elemento físico que ocupa espacio en el almacén.')}</p></div>
    {input('code', t('Código'))}{input('name', zone ? t('Nombre de zona') : t('Nombre del elemento'))}
    <label className="color-field"><span>{t("Color")}</span><input type="color" aria-label={t("Color del elemento")} value={values.color} onChange={e => change('color', e.target.value)}/></label>
    <fieldset><legend>{t("Dimensiones")}</legend><div className="form-pair">{input('width', t('Ancho'), true)}{input('depth', t('Fondo'), true)}</div>{!zone && input('height', t('Altura'), true)}</fieldset>
    <fieldset><legend>{t("Posición")}</legend><div className="form-pair">{input('x', t('Coordenada X'), true)}{input('y', t('Coordenada Y'), true)}</div><label className="field"><span>{t("Giro")}</span><select aria-label={t("Giro")} value={values.rotation} onChange={e => change('rotation', e.target.value)}>{[0, 90, 180, 270].map(n => <option key={n} value={n}>{n}°</option>)}</select></label></fieldset>
    <div className="property-note"><Icon name={zone ? 'zone' : 'lock'} size={17}/><p>{zone ? t('Puede contener estanterías y mesas. Al moverla, su contenido permanece en su posición.') : t('No puede solaparse con estanterías ni con otros elementos físicos. No genera ubicaciones.')}</p></div>
    {zone && <p className="field-help">{t('Las zonas pueden superponerse. Selecciónalas desde la lista de elementos.')}</p>}
    {error && <p className="form-error" role="alert">{t(error)}</p>}
  </div><div className="property-actions"><span>{dirty ? t('Tienes cambios por aplicar') : t('Propiedades actualizadas')}</span><div><button type="button" disabled={!dirty} onClick={reset}>{t("Cancelar")}</button><button className="primary" type="submit" disabled={!dirty}>{t("Aplicar")}</button></div></div></form>
}
