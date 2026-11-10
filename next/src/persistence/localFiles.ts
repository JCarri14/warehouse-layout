import { encode } from './documentCodec'
import { APP_NAME } from '../brand'
import { readFile, downloadDocument } from './browserFiles'
import type { WarehouseDocument } from '../warehouse/document'

export type LocalFileHandle = { name: string; getFile: () => Promise<File>; createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void>; abort?: () => Promise<void> }> }
type PickerWindow = { showSaveFilePicker?: (options: unknown) => Promise<LocalFileHandle>; showOpenFilePicker?: (options: unknown) => Promise<LocalFileHandle[]> }
const types = [{ description: `${APP_NAME} (.json)`, accept: { 'application/json': ['.json'] } }]
const cancelled = (error: unknown) => error instanceof Error && error.name === 'AbortError'
const unavailable = (error: unknown) => error instanceof Error && ['SecurityError', 'NotSupportedError'].includes(error.name)
export const warehouseFilename = (doc: WarehouseDocument) => `${doc.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'almacen'}.optiruta.json`
export async function openLocalWarehouse(api: PickerWindow = typeof window === "undefined" ? {} : window as unknown as PickerWindow) {
  if (!api.showOpenFilePicker) return undefined
  try {
    const [handle] = await api.showOpenFilePicker({ multiple: false, types })
    const file = await handle.getFile()
    return { document: await readFile(file), handle, name: file.name }
  } catch (error) { if (cancelled(error)) return null; if (unavailable(error)) return undefined; throw error }
}
export async function saveLocalWarehouse(doc: WarehouseDocument, current?: LocalFileHandle, suggestedName = warehouseFilename(doc), api: PickerWindow = typeof window === "undefined" ? {} : window as unknown as PickerWindow) {
  const source = encode(doc)
  if (!current && !api.showSaveFilePicker) { downloadDocument(doc); return { kind: 'download' as const, handle: undefined } }
  let handle: LocalFileHandle
  try { handle = current ?? await api.showSaveFilePicker!({ suggestedName, types }) }
  catch (error) { if (cancelled(error)) return null; if (unavailable(error)) { downloadDocument(doc); return { kind: 'download' as const, handle: undefined } } throw error }
  const stream = await handle.createWritable()
  try { await stream.write(source); await stream.close() }
  catch (error) { try { await stream.abort?.() } catch { /* Preserve the original write error. */ } throw error }
  return { kind: 'file' as const, handle }
}
