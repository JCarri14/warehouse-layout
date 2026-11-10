import { t } from '../i18n'
import type { Rack, WarehouseDocument } from './document'

export const DEFAULT_LOCATION_TEMPLATE = '{S}{N}{C}'
export type LocationParts = { section: string; level: string; column: string }
export type LocationFocus = { rackId: string; level: string; column: number }
type Field = 'S' | 'L' | 'E' | 'N' | 'C'
type Token = { kind: 'literal'; value: string } | { kind: 'skip' } | { kind: 'field'; field: Field; short: boolean }
type Format = { source: string; compose: (section: string, level: string, column: string) => string; parse: (code: string) => LocationParts | null }
const cache = new Map<string, Format>()
const hasControls = (value: string) => [...value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)

export function compileLocationFormat(template: string): Format {
  if (typeof template !== 'string' || template.length > 120 || hasControls(template)) throw new Error(t('El formato admite hasta 120 caracteres y una sola línea.'))
  const source = template.trim().toUpperCase() || DEFAULT_LOCATION_TEMPLATE
  if (source.length > 120) throw new Error(t('El formato admite hasta 120 caracteres.'))
  const saved = cache.get(source); if (saved) return saved
  const tokens: Token[] = [], fields = new Set<string>()
  let literal = ''
  const flush = () => { if (literal) { tokens.push({ kind: 'literal', value: literal }); literal = '' } }
  for (let i = 0; i < source.length;) {
    const char = source[i++]
    if (char === '}') throw new Error(t('El formato contiene una llave de cierre suelta.'))
    if (char !== '{') { literal += char; continue }
    const close = source.indexOf('}', i)
    if (close < 0) throw new Error(t('Falta cerrar una llave del formato.'))
    const field = source.slice(i, close); i = close + 1
    const short = !!literal || (i < source.length && source[i] !== '{' && source[i] !== '}'); flush()
    if (field === '*') { tokens.push({ kind: 'skip' }); continue }
    if (!['S', 'L', 'E', 'N', 'C'].includes(field)) throw new Error(t(`Marcador desconocido: {${field}}.`))
    if (fields.has(field)) throw new Error(t(`El marcador {${field}} aparece dos veces.`))
    fields.add(field); tokens.push({ kind: 'field', field: field as Field, short })
  }
  flush()
  if (fields.has('S') && (fields.has('L') || fields.has('E'))) throw new Error(t('Usa {S}, o {L} y {E}, para definir la sección; no ambas formas.'))
  if (!fields.has('S') && !(fields.has('L') && fields.has('E'))) throw new Error(t('Falta la sección: {S}, o {L} y {E}.'))
  if (!fields.has('N')) throw new Error(t('Falta el nivel {N} en el formato.'))
  if (!fields.has('C')) throw new Error(t('Falta la columna {C} en el formato.'))
  const minimum = Array<number>(tokens.length + 1).fill(0)
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]
    minimum[i] = minimum[i + 1] + (t.kind === 'literal' ? t.value.length : t.kind === 'skip' ? 0 : t.field === 'S' ? 2 : t.field === 'L' || t.field === 'E' || t.short ? 1 : 2)
  }
  const format: Format = {
    source,
    compose: (section, level, column) => {
      if (!/^[A-Z][0-9]$/.test(section) || !/^\d{1,2}$/.test(level) || !/^\d{1,2}$/.test(column)) throw new Error(t('Sección, nivel o columna no válidos.'))
      const values = { S: section, L: section[0], E: section[1], N: level.padStart(2, '0'), C: column.padStart(2, '0') }
      return tokens.map(t => t.kind === 'literal' ? t.value : t.kind === 'skip' ? '' : values[t.field]).join('')
    },
    parse: raw => {
      if (typeof raw !== 'string' || raw.length > 256) return null
      const code = raw.trim().toUpperCase()
      if (code.length > 256 || hasControls(code)) return null
      // Bounded, memoized matching preserves the old greedy digits/non-greedy skips
      // without constructing a backtracking regular expression from a file.
      const failed = new Set<number>()
      const walk = (index: number, position: number): Record<string, string> | null => {
        if (index === tokens.length) return position === code.length ? {} : null
        const state = index * (code.length + 1) + position
        if (failed.has(state) || code.length - position < minimum[index]) return null
        const token = tokens[index]
        if (token.kind === 'literal') {
          if (code.startsWith(token.value, position)) { const rest = walk(index + 1, position + token.value.length); if (rest) return rest }
        } else if (token.kind === 'skip') {
          for (let length = 0; length <= code.length - position - minimum[index + 1]; length++) { const rest = walk(index + 1, position + length); if (rest) return rest }
        } else {
          const sizes = token.field === 'S' ? [2] : token.field === 'L' || token.field === 'E' ? [1] : token.short ? [2, 1] : [2]
          for (const length of sizes) {
            const part = code.slice(position, position + length)
            const pattern = token.field === 'S' ? /^[A-Z][0-9]$/ : token.field === 'L' ? /^[A-Z]$/ : token.field === 'E' ? /^[0-9]$/ : /^\d{1,2}$/
            if (part.length !== length || !pattern.test(part)) continue
            const rest = walk(index + 1, position + length)
            if (rest) return { ...rest, [token.field]: part }
          }
        }
        failed.add(state); return null
      }
      const parts = walk(0, 0)
      return parts ? { section: parts.S ?? parts.L + parts.E, level: parts.N.padStart(2, '0'), column: parts.C.padStart(2, '0') } : null
    },
  }
  if (cache.size >= 32) cache.delete(cache.keys().next().value!)
  cache.set(source, format); return format
}

export type AccessPoint = { xMm: number; yMm: number; normalX: number; normalY: number }
function accessAt(rack: Rack, fraction: number): AccessPoint {
  let u: number, v: number, nx: number, ny: number
  if (rack.access === 'front' || rack.access === 'back') { u = fraction * rack.widthMm; v = rack.access === 'front' ? rack.depthMm : 0; nx = 0; ny = rack.access === 'front' ? 1 : -1 }
  else { u = rack.access === 'right' ? rack.widthMm : 0; v = fraction * rack.depthMm; nx = rack.access === 'right' ? 1 : -1; ny = 0 }
  if (rack.rotation === 90) return { xMm: rack.xMm + rack.depthMm - v, yMm: rack.yMm + u, normalX: -ny || 0, normalY: nx }
  if (rack.rotation === 180) return { xMm: rack.xMm + rack.widthMm - u, yMm: rack.yMm + rack.depthMm - v, normalX: -nx || 0, normalY: -ny || 0 }
  if (rack.rotation === 270) return { xMm: rack.xMm + v, yMm: rack.yMm + rack.widthMm - u, normalX: ny, normalY: -nx || 0 }
  return { xMm: rack.xMm + u, yMm: rack.yMm + v, normalX: nx, normalY: ny }
}
export function columnAccess(rack: Rack, column: number): AccessPoint {
  if (!Number.isInteger(column) || column < 1 || column > rack.columns) throw new Error(t('La columna no existe en esta estantería.'))
  const fraction = (column - .5) / rack.columns
  return accessAt(rack, rack.reverse ? 1 - fraction : fraction)
}
export function accessFace(rack: Rack) { return { start: accessAt(rack, rack.reverse ? 1 : 0), end: accessAt(rack, rack.reverse ? 0 : 1) } }
export type ResolvedLocation = { ok: true; rackId: string; parts: LocationParts; code: string; elevationMm: number | null; point: AccessPoint }
type MissingLocation = { ok: false; reason: 'format' | 'section' | 'level' | 'column'; message: string }
export function resolveLocation(doc: WarehouseDocument, code: string): ResolvedLocation | MissingLocation {
  const format = compileLocationFormat(doc.locationTemplate ?? DEFAULT_LOCATION_TEMPLATE), parts = format.parse(code)
  if (!parts) return { ok: false, reason: 'format', message: t('El código no coincide con el formato de ubicación del almacén.') }
  const rack = doc.racks.find(r => r.code === parts.section)
  if (!rack) return { ok: false, reason: 'section', message: t(`La sección ${parts.section} no existe en este almacén.`) }
  const column = Number(parts.column)
  if (column < 1 || column > rack.columns) return { ok: false, reason: 'column', message: t(`La columna ${parts.column} no existe en ${rack.code}.`) }
  const level = rack.levels.find(l => l.code === parts.level)
  if (!level && doc.locationPolicy !== 'section-column') return { ok: false, reason: 'level', message: t(`El nivel ${parts.level} no está definido en ${rack.code}. Configura sus niveles reales.`) }
  return { ok: true, rackId: rack.id, parts, code: format.compose(parts.section, parts.level, parts.column), elevationMm: level?.elevationMm ?? null, point: columnAccess(rack, column) }
}
export function locationsForLevel(doc: WarehouseDocument, rack: Rack, levelCode: string): ResolvedLocation[] {
  const level = rack.levels.find(l => l.code === levelCode)
  if (!level) return []
  const format = compileLocationFormat(doc.locationTemplate ?? DEFAULT_LOCATION_TEMPLATE)
  return Array.from({ length: rack.columns }, (_, i) => {
    const column = String(i + 1).padStart(2, '0')
    return { ok: true, rackId: rack.id, parts: { section: rack.code, level: level.code, column }, code: format.compose(rack.code, level.code, column), elevationMm: level.elevationMm, point: columnAccess(rack, i + 1) }
  })
}
