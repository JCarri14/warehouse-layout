import { t, locale } from '../i18n'
import { compileLocationFormat, DEFAULT_LOCATION_TEMPLATE } from './locations'

export type Rotation = 0 | 90 | 180 | 270
export type Level = { id: string; code: string; elevationMm: number }
export type RackContents = 'shelves' | 'pallets' | 'bins' | 'cartons'
export type Rack = {
  id: string; code: string; alias: string; color: string;
  xMm: number; yMm: number; widthMm: number; depthMm: number;
  heightMm: number | null; rotation: Rotation; columns: number;
  access: 'left' | 'right' | 'front' | 'back'; reverse: boolean; levels: Level[]; contents?: RackContents;
}
export type RectGeometry = Pick<Rack, 'xMm' | 'yMm' | 'widthMm' | 'depthMm' | 'rotation'>
type NamedElement = RectGeometry & { id: string; code: string; name: string; color: string }
export type WarehouseZone = NamedElement & { kind: 'zone' }
export type WarehouseFixture = NamedElement & { kind: 'obstacle' | 'table'; heightMm: number }
export type PlacedElement = Rack | WarehouseZone | WarehouseFixture
export type ElementKind = 'rack' | 'zone' | 'obstacle' | 'table'
export type WarehouseDocument = {
  format: 'optiruta-warehouse'; version: 4; id: string; name: string; gridSizeMm: number;
  widthMm: number; depthMm: number; racks: Rack[];
  zones: WarehouseZone[]; fixtures: WarehouseFixture[];
  locationTemplate: string;
  locationPolicy?: 'strict' | 'section-column';
}
export const isRack = (element: PlacedElement): element is Rack => !('kind' in element)
export const elementKind = (element: PlacedElement): ElementKind => isRack(element) ? 'rack' : element.kind
export const elementName = (element: PlacedElement) => isRack(element) ? element.alias : element.name
export const elementHeight = (element: PlacedElement) => isRack(element) ? element.heightMm ?? (element.contents === 'pallets' ? 4500 : element.contents === 'bins' ? 2000 : 2400) : element.kind === 'zone' ? 0 : element.heightMm
export const allElements = (doc: WarehouseDocument): PlacedElement[] => [...doc.racks, ...(doc.zones ?? []), ...(doc.fixtures ?? [])]
export const kindLabel = (kind: ElementKind) => ({ rack: t('Estantería'), zone: t('Zona'), obstacle: t('Obstáculo'), table: t('Mesa') })[kind]
export const uid = () => crypto.randomUUID()
export const metres = (mm: number) => new Intl.NumberFormat(locale(), { useGrouping: false, maximumFractionDigits: 3 }).format(mm / 1000)
export function parseMetres(value: string): number {
  if (!/^\d+(?:[.,]\d{1,3})?$/.test(value.trim())) throw new Error(t('Usa metros con un máximo de tres decimales, por ejemplo 2,4.'))
  const mm = Math.round(Number(value.trim().replace(',', '.')) * 1000)
  if (!Number.isSafeInteger(mm)) throw new Error(t('La medida es demasiado grande.'))
  return mm
}
export function createWarehouse(): WarehouseDocument {
  return { format: 'optiruta-warehouse', version: 4, id: uid(), name: 'Almacén sin título', gridSizeMm: 1000, widthMm: 32000, depthMm: 34000, racks: [], zones: [], fixtures: [], locationTemplate: DEFAULT_LOCATION_TEMPLATE }
}
export function footprint(r: RectGeometry) {
  return { x: r.xMm, y: r.yMm, w: r.rotation % 180 ? r.depthMm : r.widthMm, d: r.rotation % 180 ? r.widthMm : r.depthMm }
}
const integer = (n: unknown, min = 0) => typeof n === 'number' && Number.isSafeInteger(n) && n >= min
const text = (s: unknown, max: number) => typeof s === 'string' && s.trim().length > 0 && s.length <= max
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const hasControlCharacters = (value: string) => [...value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
export function validateDocument(value: unknown): string[] {
  const errors: string[] = []
  if (!object(value)) return [t('El documento no es un almacén válido.')]
  if (value.format !== 'optiruta-warehouse') return [t('Formato desconocido o archivo de la aplicación anterior.')]
  if (value.version !== 4) return [t('Esta versión del archivo no es compatible.')]
  if (value.locationPolicy !== undefined && (typeof value.locationPolicy !== 'string' || !['strict', 'section-column'].includes(value.locationPolicy))) errors.push(t('Política de ubicaciones inválida.'))
  if (!integer(value.gridSizeMm, 10) || (value.gridSizeMm as number) > 10000) errors.push(t('La cuadrícula debe medir entre 0,01 y 10 metros.'))
  if (typeof value.locationTemplate !== 'string') errors.push(t('El formato de ubicación no es válido.'))
  else { try { compileLocationFormat(value.locationTemplate) } catch (e) { errors.push((e as Error).message) } }
  if (!text(value.id, 100) || !text(value.name, 120)) errors.push(t('El almacén necesita identificador y nombre (hasta 120 caracteres).'))
  if (!integer(value.widthMm, 1) || !integer(value.depthMm, 1) || (value.widthMm as number) > 1000000 || (value.depthMm as number) > 1000000) errors.push(t('Las dimensiones deben estar entre 0,001 y 1.000 metros.'))
  if (!Array.isArray(value.racks) || value.racks.length > 1000) return [...errors, t('La lista de estanterías no es válida (máximo 1.000).')]
  const ids = new Set<string>(), codes = new Set<string>(), validRacks: PlacedElement[] = []
  for (const raw of value.racks) {
    if (!object(raw)) { errors.push(t('Hay una estantería inválida.')); continue }
    const r = raw as unknown as Rack, label = typeof r.code === 'string' ? r.code : t('Estantería')
    if (r.contents !== undefined && !['shelves', 'pallets', 'bins', 'cartons'].includes(r.contents)) errors.push(t('Contenido ilustrativo de estantería inválido.'))
    if ('kind' in raw) errors.push(t(`${label}: tipo de estantería inválido.`))
    if (!text(r.id, 100) || ids.has(r.id)) errors.push(t('Los identificadores de elementos deben ser únicos.'))
    ids.add(r.id)
    if (typeof r.code !== 'string' || !/^[A-Z][0-9]$/.test(r.code) || codes.has(r.code)) errors.push(t('Los códigos de estantería deben ser únicos: una letra y un número, por ejemplo A1.'))
    codes.add(r.code)
    if (typeof r.alias !== 'string' || r.alias.length > 80 || typeof r.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(r.color)) errors.push(t(`${label}: nombre o color inválido.`))
    const geometryValid = integer(r.xMm) && integer(r.yMm) && integer(r.widthMm, 1) && integer(r.depthMm, 1) && [0, 90, 180, 270].includes(r.rotation)
    if (!geometryValid) errors.push(t(`${label}: posición, medidas o giro inválidos.`))
    else {
      const b = footprint(r)
      if (b.x + b.w > (value.widthMm as number) || b.y + b.d > (value.depthMm as number)) errors.push(t(`${label}: queda fuera del almacén.`))
      validRacks.push(r)
    }
    if (!integer(r.columns, 1) || r.columns > 99 || !['left', 'right', 'front', 'back'].includes(r.access) || typeof r.reverse !== 'boolean') errors.push(t(`${label}: columnas o acceso inválidos.`))
    if (r.heightMm !== null && (!integer(r.heightMm, 1) || r.heightMm > 100000)) errors.push(t(`${label}: altura inválida (máximo 100 m).`))
    if (!Array.isArray(r.levels) || r.levels.length > 100) { errors.push(t(`${label}: niveles inválidos.`)); continue }
    const levelIds = new Set<string>(), levelCodes = new Set<string>(), elevations = new Set<number>()
    for (const l of r.levels) {
      if (!object(l)) { errors.push(t(`${label}: nivel inválido.`)); continue }
      if (!text(l.id, 100) || levelIds.has(l.id) || typeof l.code !== 'string' || !/^\d{2}$/.test(l.code) || levelCodes.has(l.code)) errors.push(t(`${label}: códigos e identificadores de nivel deben ser únicos (00–99).`))
      if (!integer(l.elevationMm) || r.heightMm === null || l.elevationMm > r.heightMm) errors.push(t(`${label}: cada nivel necesita una cota dentro de la altura real.`))
      if (elevations.has(l.elevationMm)) errors.push(t(`${label}: las cotas de los niveles deben ser distintas.`))
      levelIds.add(l.id); levelCodes.add(l.code); elevations.add(l.elevationMm)
    }
  }
  for (const key of ['zones', 'fixtures'] as const) {
    const list = value[key]
    if (!Array.isArray(list) || list.length > (key === 'zones' ? 100 : 200)) { errors.push(t(`La lista de ${key === 'zones' ? 'zonas' : 'elementos físicos'} no es válida.`)); continue }
    const extraCodes = new Set<string>(), names = new Set<string>()
    for (const raw of list) {
      if (!object(raw)) { errors.push(t('Hay un elemento inválido.')); continue }
      const e = raw as unknown as WarehouseZone | WarehouseFixture, label = typeof e.code === 'string' ? e.code : t('Elemento')
      if (!text(e.id, 100) || ids.has(e.id)) errors.push(t('Los identificadores de elementos deben ser únicos.'))
      ids.add(e.id)
      const code = typeof e.code === 'string' ? e.code.trim().toUpperCase() : ''
      const name = typeof e.name === 'string' ? e.name.trim().toUpperCase() : ''
      if (!text(code, 20) || hasControlCharacters(code) || extraCodes.has(code)) errors.push(t('Los códigos deben ser únicos en su categoría y tener de 1 a 20 caracteres.'))
      extraCodes.add(code)
      if (!text(name, 80) || hasControlCharacters(name) || (key === 'zones' && names.has(name))) errors.push(t('Los nombres de zonas deben ser únicos; cada nombre necesita de 1 a 80 caracteres.'))
      names.add(name)
      if (typeof e.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(e.color)) errors.push(t(`${label}: color inválido.`))
      if (key === 'zones' ? e.kind !== 'zone' : !['obstacle', 'table'].includes(e.kind)) { errors.push(t(`${label}: tipo de elemento inválido.`)); continue }
      if (key === 'fixtures' && (!('heightMm' in e) || !integer(e.heightMm, 1) || e.heightMm > 100000)) errors.push(t(`${label}: altura inválida (máximo 100 m).`))
      const geometryValid = integer(e.xMm) && integer(e.yMm) && integer(e.widthMm, 1) && integer(e.depthMm, 1) && [0, 90, 180, 270].includes(e.rotation)
      if (!geometryValid) { errors.push(t(`${label}: posición, medidas o giro inválidos.`)); continue }
      const b = footprint(e)
      if (b.x + b.w > (value.widthMm as number) || b.y + b.d > (value.depthMm as number)) errors.push(t(`${label}: queda fuera del almacén.`))
      if (key === 'fixtures') validRacks.push(e)
    }
  }
  for (let i = 0; i < validRacks.length; i++) for (let j = i + 1; j < validRacks.length; j++) {
    const a = footprint(validRacks[i]), b = footprint(validRacks[j])
    if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.d && a.y + a.d > b.y) errors.push(t(`${validRacks[i].code} y ${validRacks[j].code} se solapan.`))
  }
  return [...new Set(errors)]
}
export function assertDocument(value: unknown): asserts value is WarehouseDocument {
  const errors = validateDocument(value)
  if (errors.length) throw new Error(errors.join(' '))
}
export function addRack(doc: WarehouseDocument): WarehouseDocument {
  const code = Array.from({ length: 260 }, (_, i) => `${String.fromCharCode(65 + Math.floor(i / 10))}${i % 10}`).find(c => !doc.racks.some(r => r.code === c))
  if (!code) throw new Error(t('No quedan códigos libres de sección.'))
  const rack: Rack = { id: uid(), code, alias: '', color: '#337b78', xMm: 0, yMm: 0, widthMm: 6000, depthMm: 1200, heightMm: 3000, rotation: 0, columns: 3, access: 'front', reverse: false, levels: [{ id: uid(), code: '00', elevationMm: 0 }, { id: uid(), code: '01', elevationMm: 1400 }, { id: uid(), code: '02', elevationMm: 2800 }] }
  for (let y = 1000; y + rack.depthMm <= doc.depthMm; y += 2000) for (let x = 1000; x + rack.widthMm <= doc.widthMm; x += 7000) {
    const candidate = { ...doc, racks: [...doc.racks, { ...rack, xMm: x, yMm: y }] }
    if (!validateDocument(candidate).length) return candidate
  }
  const candidate = { ...doc, racks: [...doc.racks, rack] }
  if (!validateDocument(candidate).length) return candidate
  throw new Error(t('No hay espacio para una estantería de 6 × 1,2 m. Amplía el almacén o libera espacio.'))
}
export function exampleWarehouse(): WarehouseDocument {
  const doc = createWarehouse(); doc.name = 'Almacén de ejemplo'
  const colors = ['#337b78', '#9b783d', '#637b9b']
  for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) {
    const base = addRack(createWarehouse()).racks[0]
    doc.racks.push({ ...base, code: `${String.fromCharCode(65 + col)}${row + 1}`, xMm: 2500 + col * 9500, yMm: 3500 + row * 5500, color: colors[col] })
  }
  return doc
}
