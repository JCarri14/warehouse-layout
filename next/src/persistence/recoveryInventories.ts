import type { DataSet } from '../operations/types'

export type RecoveryInventories = { get: (id: string) => Promise<DataSet | undefined>; put: (id: string, data: DataSet) => Promise<void>; remove: (id: string) => Promise<void> }
async function access<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('optiruta.recovery', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('inventories')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction('inventories', mode)
    let request: IDBRequest<T>
    try { request = action(transaction.objectStore('inventories')) }
    catch (error) { db.close(); reject(error); return }
    transaction.oncomplete = () => { db.close(); resolve(request.result) }
    transaction.onabort = transaction.onerror = () => { db.close(); reject(transaction.error ?? request.error) }
  })
}
export const recoveryInventories: RecoveryInventories = {
  get: id => access('readonly', store => store.get(id)),
  put: async (id, data) => { await access('readwrite', store => store.put(data, id)) },
  remove: async id => { await access('readwrite', store => store.delete(id)) },
}
