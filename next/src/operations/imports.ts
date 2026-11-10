import { t, locale } from '../i18n'
import { compileLocationFormat } from '../warehouse/locations'
import type { DataLine, OrderDraftLine } from './types'

export type ImportTable = { name: string; headers: string[]; rows: string[][]; sourceRows: number[]; rawRecords?: string[][]; rawSourceRows?: number[]; headerIndex?: number; strictColumns?: boolean; structureError?: string }
export type ColumnMapping = { reference: number; description: number; location: number; quantity: number; origin: number; defaultQuantityOne: boolean }
const MAX_BYTES = 10 * 1024 * 1024, MAX_ROWS = 50000, MAX_COLUMNS = 100
const normalize = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

export function parseQuantity(text: string): number {
  let s = text.trim().replace(/[ \u00a0]/g, '')
  const comma = s.lastIndexOf(','), point = s.lastIndexOf('.')
  if (comma >= 0 && point >= 0) s = comma > point ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (comma >= 0) s = s.replace(',', '.')
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) throw new Error(t('La cantidad debe ser un número válido.'))
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0 || n > 1e9) throw new Error(t('La cantidad debe estar entre 0 y 1.000.000.000.'))
  return Object.is(n, -0) ? 0 : n
}
export function formatQuantity(n: number): string {
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString(locale(), { useGrouping: false, maximumFractionDigits: 20 })
}
export function guessMapping(table: ImportTable): ColumnMapping {
  const used = new Set<number>(), headers = table.headers.map(normalize)
  const find = (...names: string[]) => { for (const name of names) { const i = headers.findIndex((h, j) => h === name && !used.has(j)); if (i >= 0) { used.add(i); return i } } return -1 }
  const location = find('ubicacion', 'location', 'ubi', 'loc', 'posicion')
  const quantity = find('cantidad', 'quantity', 'qty', 'unidades', 'units', 'cant')
  let description = find('descripcion', 'descripcio', 'description', 'desc', 'producto', 'product', 'nombre', 'name')
  const reference = find('referencia', 'reference', 'ref', 'sku', 'pieza', 'part', 'codigo', 'code', ...(description >= 0 ? ['articulo', 'article', 'item'] : []))
  if (description < 0) description = find('articulo', 'article', 'item')
  const origin = find('origen', 'origin', 'orden', 'ot', 'pedido', 'order')
  return { reference, description, location, quantity, origin, defaultQuantityOne: false }
}
function fromRecords(records: string[][], numbers: number[], name: string, strict: boolean): ImportTable {
  if (!records.length || records.length > MAX_ROWS + 100) throw new Error(t('El archivo está vacío o supera 50.000 filas.'))
  // Unknown ERP labels still expose a useful initial table and retain every row
  // so selecting a different header never requires reopening the original file.
  let header = -1, widest = 0
  records.slice(0, 100).forEach((row, i) => { if (row.some(s => s.trim()) && row.length > widest) { widest = row.length; header = i } })
  let best = -1
  for (let i = 0; i < Math.min(records.length, 100); i++) {
    const mapping = guessMapping({ name, headers: records[i], rows: [], sourceRows: [] })
    const score = (mapping.location >= 0 ? 4 : 0) + (mapping.reference >= 0 || mapping.description >= 0 ? 2 : 0) + (mapping.quantity >= 0 ? 1 : 0)
    if (score >= 6 && score > best) { header = i; best = score }
  }
  if (header < 0) throw new Error(t('No se encuentra una tabla con datos.'))
  return selectRecords(records, numbers, name, strict, header)
}
export function chooseHeader(table: ImportTable, index: number): ImportTable {
  if (!table.rawRecords || !table.rawSourceRows) throw new Error(t('La tabla no conserva las filas originales.'))
  return selectRecords(table.rawRecords, table.rawSourceRows, table.name, table.strictColumns ?? true, index)
}
function selectRecords(records: string[][], numbers: number[], name: string, strict: boolean, header: number): ImportTable {
  if (!Number.isInteger(header) || header < 0 || header >= Math.min(records.length, 100)) throw new Error(t('Selecciona una fila de cabecera válida.'))
  const headers = records[header], width = headers.length
  if (!width || width > MAX_COLUMNS) throw new Error(t('La tabla supera 100 columnas.'))
  const rows: string[][] = [], sourceRows: number[] = []; let structureError = ''
  for (let i = header + 1; i < records.length; i++) {
    const row = records[i]
    if (!row.some(s => s.trim())) continue
    // ERP reports repeat their column headings at every production subsection/page.
    if (headers.every((cell, c) => normalize(cell) === normalize(row[c] ?? ''))) continue
    if (row.length > MAX_COLUMNS || (strict && row.length !== width) || (!strict && row.length > width && row.slice(width).some(Boolean))) structureError ||= t(`Fila ${numbers[i]}: número de columnas distinto de la cabecera.`)
    rows.push(Array.from({ length: width }, (_, c) => row[c] ?? '')); sourceRows.push(numbers[i])
    if (rows.length > MAX_ROWS) throw new Error(t('La tabla supera 50.000 filas.'))
  }
  if (!rows.length && records.length < 2) throw new Error(t('Se necesitan cabecera y datos.'))
  return { name, headers, rows, sourceRows, rawRecords: records, rawSourceRows: numbers, headerIndex: header, strictColumns: strict, structureError }
}
function detectSeparator(text: string): string {
  const candidates = [';', ',', '\t'], counts: number[][] = [], current = [0, 0, 0]; let quoted = false
  for (let i = 0; i < text.length && counts.length < 100; i++) {
    const char = text[i]
    if (char === '"') { if (quoted && text[i + 1] === '"') i++; else quoted = !quoted }
    else if (!quoted && (char === '\n' || char === '\r')) { if (char === '\r' && text[i + 1] === '\n') i++; counts.push([...current]); current.fill(0) }
    else if (!quoted) { const index = candidates.indexOf(char); if (index >= 0) current[index]++ }
  }
  if (current.some(Boolean)) counts.push(current)
  const scores = candidates.map((separator, column) => {
    const first = counts.findIndex(row => row[column] > 0)
    if (first < 0) return -1
    const widths = counts.slice(first).filter(row => row.some(Boolean)).map(row => row[column])
    const frequencies = new Map<number, number>()
    widths.filter(Boolean).forEach(width => frequencies.set(width, (frequencies.get(width) ?? 0) + 1))
    const consistent = Math.max(...frequencies.values())
    const recognized = text.split(/\r?\n/).slice(0, 100).some(line => {
      const mapping = guessMapping({ name: '', headers: line.split(separator).map(cell => cell.replace(/^"|"$/g, '')), rows: [], sourceRows: [] })
      return mapping.location >= 0 && (mapping.reference >= 0 || mapping.description >= 0)
    })
    // The header and subsequent records must agree. Commas in a description
    // should not win just because they are more numerous than real separators.
    return (recognized ? 1000 : 0) + consistent / widths.length * 100 + Math.min(consistent, 10) - first * 2 + (separator === '\t' ? .1 : 0)
  })
  return candidates[scores.indexOf(Math.max(...scores))]
}
export function parseDelimited(text: string, name = 'CSV'): ImportTable {
  if (text.length > MAX_BYTES) throw new Error(t('El archivo supera 10 MiB.'))
  text = text.replace(/^\uFEFF/, '')
  const separator = /\.tsv$/i.test(name) ? '\t' : detectSeparator(text)
  const records: string[][] = [], numbers: number[] = []; let row: string[] = [], field = '', inside = false, closed = false, line = 1, start = 1
  const finish = () => { row.push(field); if (row.some(Boolean) || row.length > 1) { records.push(row); numbers.push(start) } row = []; field = ''; closed = false; if (records.length > MAX_ROWS + 100) throw new Error(t('La tabla supera 50.000 filas.')) }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inside) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else { inside = false; closed = true } } else { field += c; if (c === '\n' || c === '\r' && text[i + 1] !== '\n') line++ } continue }
    if (c === '"') { if (field || closed) throw new Error(t(`Fila ${line}: comillas en campo sin delimitar.`)); inside = true }
    else if (c === separator) { row.push(field); if (row.length >= MAX_COLUMNS) throw new Error(t('La tabla supera 100 columnas.')); field = ''; closed = false }
    else if (c === '\r' || c === '\n') { if (c === '\r' && text[i + 1] === '\n') i++; finish(); line++; start = line }
    else { if (closed) throw new Error(t(`Fila ${line}: texto después de cerrar comillas.`)); field += c }
  }
  if (inside) throw new Error(t(`Fila ${start}: comillas sin cerrar.`))
  finish()
  return fromRecords(records, numbers, name, true)
}
export async function readTables(file: File): Promise<ImportTable[]> {
  if (!file.size || file.size > MAX_BYTES) throw new Error(t('El archivo está vacío o supera 10 MiB.'))
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'csv' || extension === 'tsv') return [parseDelimited(await file.text(), file.name)]
  if (extension !== 'xls' && extension !== 'xlsx') throw new Error(t('Selecciona un archivo CSV, TSV, XLS o XLSX.'))
  const xlsx = await import('xlsx'), buffer = await file.arrayBuffer(), bytes = new Uint8Array(buffer)
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b) && !(bytes[0] === 0xd0 && bytes[1] === 0xcf)) throw new Error(t('El archivo no es un libro Excel válido.'))
  const workbook = xlsx.read(buffer, { type: 'array', cellHTML: false, cellFormula: false, sheetRows: MAX_ROWS + 101 })
  const tables: ImportTable[] = []
  let total = 0
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name], ref = sheet['!fullref'] ?? sheet['!ref']
    if (!ref) continue
    const range = xlsx.utils.decode_range(ref)
    if (range.e.r >= MAX_ROWS + 100 || range.e.c >= MAX_COLUMNS) throw new Error(t('El libro supera 50.000 filas o 100 columnas.'))
    const rows = xlsx.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '', blankrows: true, range: 0 }).map(row => row.map(cell => String(cell ?? '')))
    if (rows.filter(row => row.some(s => s.trim())).length < 2) continue
    const table = fromRecords(rows, rows.map((_, i) => i + 1), name, false)
    total += table.rows.length; if (total > MAX_ROWS) throw new Error(t('El libro supera 50.000 filas.'))
    tables.push(table)
  }
  if (!tables.length) throw new Error(t('No se encuentra una tabla con datos en el libro.'))
  return tables
}
type Issues = { row: number; message: string }[]
export function previewImport(table: ImportTable, mapping: ColumnMapping, template: string, origin = ''): { lines: DataLine[]; errors: Issues; omitted: Issues } {
  if (table.structureError) throw new Error(table.structureError)
  const indexes = [mapping.reference, mapping.description, mapping.location, mapping.quantity, mapping.origin]
  if (indexes.some(i => !Number.isInteger(i) || i < -1 || i >= table.headers.length)) throw new Error(t('Selecciona columnas válidas.'))
  if (new Set(indexes.filter(i => i >= 0)).size !== indexes.filter(i => i >= 0).length) throw new Error(t('Cada campo debe usar una columna diferente.'))
  if (mapping.location < 0 || mapping.reference < 0 && mapping.description < 0) throw new Error(t('Selecciona ubicación y referencia o descripción.'))
  if (mapping.quantity < 0 && !mapping.defaultQuantityOne) throw new Error(t('Selecciona cantidad o confirma cantidad 1 por fila.'))
  if (!table.rows.length || table.rows.length > MAX_ROWS || table.headers.length > MAX_COLUMNS || table.sourceRows.length !== table.rows.length || table.rows.some(r => r.length !== table.headers.length)) throw new Error(t('La tabla está vacía o tiene una estructura no válida.'))
  const format = compileLocationFormat(template), lines: DataLine[] = [], errors: Issues = [], omitted: Issues = []
  table.rows.forEach((row, i) => {
    const source = table.sourceRows[i], cell = (index: number) => index < 0 ? '' : row[index].trim(), location = cell(mapping.location)
    if (!location || location === '-' || /^\(.*\)$/.test(location)) { omitted.push({ row: source, message: t('Sin ubicación.') }); return }
    try {
      const parts = format.parse(location); if (!parts) throw new Error(t('La ubicación no coincide con el formato del almacén.'))
      const reference = cell(mapping.reference), description = cell(mapping.description)
      if (!reference && !description) throw new Error(t('Falta referencia o descripción.'))
      const quantity = mapping.quantity < 0 ? 1 : parseQuantity(cell(mapping.quantity))
      lines.push({ id: `import-${i}-${source}`, reference, description, location: format.compose(parts.section, parts.level, parts.column), quantity, origin: cell(mapping.origin) || origin })
    } catch (error) { errors.push({ row: source, message: error instanceof Error ? error.message : t('Fila no válida.') }) }
  })
  return { lines, errors, omitted }
}
export function draftToLines(drafts: OrderDraftLine[], template: string): { lines: DataLine[]; errors: Issues } {
  const table: ImportTable = { name: '', headers: [t('Referencia'), t('Descripción'), t('Ubicación'), t('Cantidad'), t('Origen')], rows: drafts.map(l => [l.reference, l.description, l.location, l.quantityText, l.origin]), sourceRows: drafts.map((_, i) => i + 1) }
  if (!drafts.length) return { lines: [], errors: [] }
  const result = previewImport(table, guessMapping(table), template)
  for (const omitted of result.omitted) result.errors.push({ row: omitted.row, message: t('Falta la ubicación.') })
  const lines = result.lines.filter(line => { const row = Number(line.id.split('-')[2]); if ([line.reference, line.description, line.origin, drafts[row - 1].id].some(text => text.length > 4096)) { result.errors.push({ row, message: t('Los campos de texto de la OT admiten hasta 4.096 caracteres.') }); return false } if (line.quantity <= 0) { result.errors.push({ row, message: t('La cantidad debe ser positiva.') }); return false } line.id = drafts[row - 1].id; return true })
  return { lines, errors: result.errors.sort((a, b) => a.row - b.row) }
}
export function validateDataLines(value: unknown): value is DataLine[] {
  return Array.isArray(value) && value.length <= MAX_ROWS && value.every(line => line !== null && typeof line === 'object' && ['id', 'reference', 'description', 'location', 'origin'].every(key => typeof line[key] === 'string' && line[key].length <= MAX_BYTES) && !!line.id && !!line.location.trim() && !!(line.reference.trim() || line.description.trim()) && typeof line.quantity === 'number' && Number.isFinite(line.quantity) && line.quantity >= 0 && line.quantity <= 1e9) && new Set(value.map(l => l.id)).size === value.length
}
