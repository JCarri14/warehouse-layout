import { useEffect, useRef, useState } from 'react'
import { t, type Language } from '../i18n'
import { measurementUnits, type MeasurementUnit } from '../measurements'

type Props = {
  unit: MeasurementUnit; onUnit: (value: MeasurementUnit) => void; blocked: boolean
  language: Language; onLanguage: (value: Language) => void
  continueLast: boolean; onContinueLast: (value: boolean) => void
}
export function AppSettings({ unit, onUnit, blocked, language, onLanguage, continueLast, onContinueLast }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null)
  const names = { m: 'Metros', cm: 'Centímetros', mm: 'Milímetros', ft: 'Pies', in: 'Pulgadas' }
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  return <div className="app-settings measurement-settings" ref={root} onKeyDown={event => {
    event.stopPropagation()
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() }
  }} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false) }}>
    <button type="button" ref={trigger} aria-expanded={open} aria-controls="app-preferences" onClick={() => setOpen(value => !value)}>{t('Ajustes')}<span aria-hidden="true">⌄</span></button>
    <div id="app-preferences" className="measurement-popover" hidden={!open} role="region" aria-label={t('Ajustes')}>
      <label className="field"><span>{t('Idioma')}</span><select aria-label={t('Idioma')} value={language} onChange={event => onLanguage(event.target.value as Language)}><option value="es">Español</option><option value="en">English</option></select></label>
      <label className="field"><span>{t('Unidad de medida')}</span><select aria-label={t('Unidad de medida')} value={unit} disabled={blocked} onChange={event => onUnit(event.target.value as MeasurementUnit)}>{measurementUnits.map(unit => <option key={unit} value={unit}>{t(names[unit])} ({unit})</option>)}</select></label>
      <p className="settings-unit-help">{blocked ? t('Aplica o cancela las propiedades y coordenadas pendientes antes de cambiar de unidad.') : t('Se aplica a las medidas, distancias e informes. Los archivos conservan sus medidas reales.')}</p>
      <label className="field"><span>{t('Al iniciar')}</span><select aria-label={t('Al iniciar')} value={continueLast ? 'last' : 'home'} onChange={event => onContinueLast(event.target.value === 'last')}><option value="home">{t('Mostrar la pantalla de inicio')}</option><option value="last">{t('Continuar con el último almacén')}</option></select></label>
    </div>
  </div>
}
