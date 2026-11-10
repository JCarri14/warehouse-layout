import { t } from '../i18n'
import { decode, encode } from './documentCodec'
import type { WarehouseDocument } from '../warehouse/document'
export async function readFile(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error(t('El archivo supera el límite de apertura de 10 MiB.'))
  return decode(await file.text())
}
export function downloadDocument(doc: WarehouseDocument) {
  const url = URL.createObjectURL(new Blob([encode(doc)], { type: 'application/json' }))
  const a = document.createElement('a'); a.href = url
  a.download = `${doc.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'almacen'}.optiruta.json`
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
