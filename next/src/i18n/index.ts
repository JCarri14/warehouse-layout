import { useSyncExternalStore } from 'react'
import { english } from './dictionary'

export type Language = 'es' | 'en'
export const LANGUAGE_KEY = 'optiruta.language'
function initialLanguage(): Language {
  if (typeof window !== 'undefined' && window.location.pathname === '/') return 'es'
  if (typeof window !== 'undefined' && window.location.pathname.replace(/\/$/, '') === '/en') return 'en'
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'es' } catch { return 'es' }
}
let language: Language = initialLanguage()
if (typeof document !== 'undefined') document.documentElement.lang = language
const listeners = new Set<() => void>()
export const getLanguage = () => language
export const locale = (value: Language = language) => value === 'en' ? 'en-GB' : 'es-ES'
export function setLanguage(value: Language) {
  if (value !== 'es' && value !== 'en') return
  if (value === language) return
  language = value
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(LANGUAGE_KEY, value) } catch { /* A blocked preference store must not prevent changing language. */ }
  if (typeof document !== 'undefined') document.documentElement.lang = value
  listeners.forEach(notify => notify())
}
const subscribe = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify) } }
export function useLanguage(): Language { return useSyncExternalStore(subscribe, getLanguage, getLanguage) }
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const compilePatterns = (entries: [string, string][]) => entries.filter(([source]) => /\{\d+\}/.test(source)).map(([source, target]) => {
  const keys: string[] = []
  const pieces = source.split(/(\{\d+\})/g).map(part => /^\{\d+\}$/.test(part) ? (keys.push(part.slice(1, -1)), '(.+?)') : escape(part))
  return { regex: new RegExp('^' + pieces.join('') + '$'), target, keys }
})
const patterns = compilePatterns(Object.entries(english))
const spanish = new Map(Object.entries(english).map(([source, target]) => [target, source]))
const reversePatterns = compilePatterns([...spanish])
function translate(source: string): string {
  const exact = language === 'en' ? english[source] : spanish.get(source)
  if (exact !== undefined) return exact
  for (const { regex, target, keys } of language === 'en' ? patterns : reversePatterns) {
    const match = regex.exec(source)
    if (match) return target.replace(/\{(\d+)\}/g, (whole, key) => match[keys.indexOf(key) + 1] ?? whole)
  }
  return source
}
/** Translate interface copy only. Names, references, locations and imported descriptions are data. */
export function t(source: string, values?: Record<string | number, string | number>): string {
  const translated = translate(source)
  return values ? translated.replace(/\{(\w+)\}/g, (whole, key) => Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : whole) : translated
}

