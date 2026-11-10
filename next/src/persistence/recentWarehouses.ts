import { decode, encode } from './documentCodec'
import { readFile } from './browserFiles'
import type { LocalFileHandle } from './localFiles'
import type { WarehouseDocument } from '../warehouse/document'

export type RecentWarehouse = { id: string; name: string; filename?: string; updatedAt: number; source: string; handle?: LocalFileHandle }
const database = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('optiruta.recents', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('warehouses', { keyPath: 'id' })
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
async function access<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('warehouses', mode)
    let request: IDBRequest<T>
    try { request = action(transaction.objectStore('warehouses')) }
    catch (error) { db.close(); reject(error); return }
    transaction.oncomplete = () => { db.close(); resolve(request.result) }
    transaction.onabort = transaction.onerror = () => { db.close(); reject(transaction.error ?? request.error) }
  })
}
export async function listRecentWarehouses(): Promise<RecentWarehouse[]> {
  const entries = await access('readonly', store => store.getAll()) as RecentWarehouse[]
  return entries.sort((a, b) => b.updatedAt - a.updatedAt)
}
export async function rememberWarehouse(doc: WarehouseDocument, filename?: string, handle?: LocalFileHandle) {
  const entry: RecentWarehouse = { id: doc.id, name: doc.name, filename, updatedAt: Date.now(), source: encode(doc), handle }
  try { await access('readwrite', store => store.put(entry)) }
  catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'DataCloneError') throw error
    delete entry.handle
    await access('readwrite', store => store.put(entry))
  }
  const entries = await listRecentWarehouses()
  await Promise.all(entries.slice(12).map(entry => forgetWarehouse(entry.id)))
}
export const forgetWarehouse = (id: string) => access('readwrite', store => store.delete(id))
export async function openRecentWarehouse(entry: RecentWarehouse): Promise<{ document: WarehouseDocument; handle?: LocalFileHandle }> {
  if (!entry.handle) return { document: decode(entry.source) }
  const handle = entry.handle as LocalFileHandle & { requestPermission?: (options: { mode: string }) => Promise<string> }
  if (handle.requestPermission && await handle.requestPermission({ mode: 'read' }) !== 'granted') throw new Error('No se ha concedido acceso al archivo. Puedes abrir la copia local.')
  return { document: await readFile(await handle.getFile()), handle }
}
