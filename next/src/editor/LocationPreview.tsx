import { formatMeasure as metres, getMeasurementUnit } from '../measurements'
import { t, useLanguage } from '../i18n'
import { useState } from 'react'
import { type Rack, type WarehouseDocument } from '../warehouse/document'
import { locationsForLevel, type ResolvedLocation } from '../warehouse/locations'
type Props = { doc: WarehouseDocument; rack: Rack; pending: boolean; focused?: ResolvedLocation; onFocus: (location: ResolvedLocation) => void }
export function LocationPreview({ doc, rack, pending, focused, onFocus }: Props) {
  useLanguage()
  const [level, setLevel] = useState(focused?.parts.level ?? rack.levels[0]?.code ?? '')
  const rows = locationsForLevel(doc, rack, level)
  return <fieldset className="location-preview"><legend>{t("Vista previa de ubicaciones")}</legend>
    {!rack.levels.length ? <p className="field-help">{t("Define los niveles reales para generar ubicaciones.")}</p> : <>
      <label className="field"><span>{t("Nivel")}</span><select aria-label={t("Nivel de vista previa")} value={level} onChange={e => setLevel(e.target.value)}>{rack.levels.map(l => <option key={l.id} value={l.code}>{l.code} · {metres(l.elevationMm)} {getMeasurementUnit()}</option>)}</select></label>
      <div className="location-list-heading"><span>{t("Columna")}</span><span>{t("Ubicación")}</span></div>
      <div className="location-list">{rows.map(row => <button key={row.parts.column} type="button" className="location-row" aria-label={`Mostrar ${row.code}`} aria-pressed={focused?.code === row.code} onClick={() => onFocus(row)}><span>{row.parts.column}</span><code>{row.code}</code><span aria-hidden="true">↗</span></button>)}</div>
      <p className="field-help">{rows.length}{" "}{t("ubicaciones en este nivel. Pulsa una para verla en el plano.")}</p>
    </>}
    {pending && <p className="field-help">{t("Aplica los cambios para actualizar esta vista previa.")}</p>}
  </fieldset>
}
