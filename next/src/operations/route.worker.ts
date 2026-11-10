import { t, setLanguage, type Language } from '../i18n'
import { calculateRoute } from './routing'
import type { WarehouseDocument } from '../warehouse/document'
import type { DataLine, RouteSettings } from './types'

self.onmessage = (event: MessageEvent<{ warehouse: WarehouseDocument; lines: DataLine[]; settings: RouteSettings; language?: Language }>) => {
  try {
    setLanguage(event.data.language ?? 'es')
    const { warehouse, lines, settings } = event.data
    self.postMessage({ ok: true, result: calculateRoute(warehouse, lines, settings) })
  } catch (error) {
    self.postMessage({ ok: false, message: error instanceof Error ? error.message : t('No se pudo calcular la ruta.') })
  }
}
