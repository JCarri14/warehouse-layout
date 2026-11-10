import { useSyncExternalStore } from 'react'
import { locale, t } from './i18n'

export const measurementUnits = ['m', 'cm', 'mm', 'ft', 'in'] as const
export type MeasurementUnit = typeof measurementUnits[number]
const factors: Record<MeasurementUnit, number> = { m: 1000, cm: 10, mm: 1, ft: 304.8, in: 25.4 }
const valid = (value: unknown): value is MeasurementUnit => measurementUnits.includes(value as MeasurementUnit)
const storageKey = 'optiruta.measurementUnit'
let unit: MeasurementUnit = 'm'
try { const saved = localStorage.getItem(storageKey); if (valid(saved)) unit = saved } catch { /* Metres are the default when preferences are unavailable. */ }
const listeners = new Set<() => void>()
export const getMeasurementUnit = () => unit
export function setMeasurementUnit(value: MeasurementUnit) {
  if (!valid(value)) return
  unit = value
  try { localStorage.setItem(storageKey, value) } catch { /* The preference still applies for this session. */ }
  listeners.forEach(listener => listener())
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const useMeasurementUnit = () => useSyncExternalStore(subscribe, getMeasurementUnit, () => 'm' as MeasurementUnit)
export function formatMeasure(mm: number, selected = unit) {
  return new Intl.NumberFormat(locale(), { useGrouping: false, maximumFractionDigits: selected === 'm' ? 3 : selected === 'mm' ? 0 : 6 }).format(mm / factors[selected])
}
export function parseMeasure(value: string, selected = unit): number {
  if (!/^\d+(?:[.,]\d{1,6})?$/.test(value.trim())) throw new Error(t('Introduce una medida válida en la unidad indicada. Puedes usar coma o punto decimal.'))
  const mm = Math.round(Number(value.trim().replace(',', '.')) * factors[selected])
  if (!Number.isSafeInteger(mm)) throw new Error(t('La medida es demasiado grande.'))
  return mm
}
export const lengthText = (mm: number, selected = unit) => `${formatMeasure(mm, selected)} ${selected}`

/** Old recovery drafts were always in metres; keep their physical meaning. */
export function convertMeasurementDraft(pending?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!pending) return undefined
  const from = valid(pending.__unit) ? pending.__unit : 'm'
  if (from === unit) return pending
  const convert = (value: unknown) => { try { return typeof value === 'string' && value.trim() ? formatMeasure(parseMeasure(value, from)) : value } catch { return value } }
  const result = { ...pending }
  for (const key of ['x', 'y', 'width', 'depth', 'height', 'grid']) if (key in result) result[key] = convert(result[key])
  if (Array.isArray(result.levels)) result.levels = result.levels.map(level => ({ ...level, elevation: convert(level.elevation) }))
  return result
}
