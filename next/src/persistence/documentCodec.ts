import { t } from '../i18n'
import { assertDocument, type WarehouseDocument } from '../warehouse/document'
import { DEFAULT_LOCATION_TEMPLATE } from '../warehouse/locations'
export function encode(doc: WarehouseDocument): string { assertDocument(doc); return JSON.stringify(doc, null, 2) }
export function decode(source: string): WarehouseDocument {
  let value: unknown
  try { value = JSON.parse(source) } catch { throw new Error(t('El archivo no contiene JSON válido.')) }
  if (value && typeof value === 'object' && !Array.isArray(value) && 'format' in value && value.format === 'optiruta-warehouse' && 'version' in value && value.version === 1) {
    if ('zones' in value || 'fixtures' in value || 'locationTemplate' in value) throw new Error(t('El archivo de versión 1 contiene extensiones desconocidas. No se abrirá para evitar perder datos.'))
    value = { ...value, version: 2, zones: [], fixtures: [] }
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && 'format' in value && value.format === 'optiruta-warehouse' && 'version' in value && value.version === 2) {
    if ('locationTemplate' in value) throw new Error(t('El archivo de versión 2 contiene una extensión de ubicaciones desconocida. No se abrirá para evitar perder datos.'))
    value = { ...value, version: 3, locationTemplate: DEFAULT_LOCATION_TEMPLATE }
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && 'format' in value && value.format === 'optiruta-warehouse' && 'version' in value && value.version === 3) {
    if ('gridSizeMm' in value) throw new Error(t('El archivo de versión 3 contiene una extensión de cuadrícula desconocida.'))
    value = { ...value, version: 4, gridSizeMm: 1000 }
  }
  // Upgrade previously downloaded copies of the converted desktop showcase as well.
  if (value && typeof value === 'object' && !Array.isArray(value) && 'id' in value && value.id === 'example-desktop-detailed' && !('locationPolicy' in value)) value = { ...value, locationPolicy: 'section-column' }
  assertDocument(value)
  return value
}
