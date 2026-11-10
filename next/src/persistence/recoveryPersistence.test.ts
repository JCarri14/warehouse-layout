import { expect, it, vi } from 'vitest'
import { createRecoveryPersistence } from './recoveryPersistence'
import { createWarehouse } from '../warehouse/document'
import { encodeRecovery, RECOVERY_KEY } from './recovery'
import type { DataSet, WorkspaceSnapshot } from '../operations/types'

const session = (): WorkspaceSnapshot => {
  const warehouse = createWarehouse(), order = { name: 'OT sin título', lines: [] }
  return { warehouse, selected: null, inventory: { name: 'Grande', lines: Array.from({ length: 1001 }, (_, i) => ({ id: String(i), reference: 'R', description: '', location: 'A10101', quantity: 1, origin: '' })) }, order, settings: null, mode: 'inventory', savedWarehouse: JSON.stringify(warehouse), savedOrder: JSON.stringify(order) }
}
function setup() {
  const values = new Map<string, string>(), blobs = new Map<string, DataSet>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: vi.fn((key: string, value: string) => { values.set(key, value) }), removeItem: (key: string) => { values.delete(key) } }
  const inventories = { get: vi.fn(async (id: string) => blobs.get(id)), put: vi.fn(async (id: string, data: DataSet) => { blobs.set(id, structuredClone(data)) }), remove: vi.fn(async (id: string) => { blobs.delete(id) }) }
  return { storage, inventories, values, blobs }
}
it('guarda una sola vez el inventario grande y recupera también las copias anteriores', async () => {
  const { storage, inventories } = setup(), persistence = createRecoveryPersistence(storage, inventories), data = session()
  expect((await persistence.save(data)).ok).toBe(true)
  expect(storage.getItem(RECOVERY_KEY)!.length).toBeLessThan(2000)
  expect((await persistence.save({ ...data, mode: 'order' })).ok).toBe(true)
  expect(inventories.put).toHaveBeenCalledTimes(1)
  const restored = await persistence.load()
  expect(restored.ok && restored.envelope?.session.inventory).toEqual(data.inventory)
  storage.setItem(RECOVERY_KEY, encodeRecovery(data))
  const legacy = await persistence.load()
  expect(legacy.ok && legacy.envelope?.session.inventory).toEqual(data.inventory)
})
it('conserva la copia anterior si falla la escritura del inventario o de su referencia', async () => {
  const { storage, inventories, blobs } = setup(), persistence = createRecoveryPersistence(storage, inventories), data = session()
  await persistence.save(data)
  const previous = storage.getItem(RECOVERY_KEY)
  inventories.put.mockRejectedValueOnce(new Error('quota'))
  expect((await persistence.save({ ...data, inventory: { ...data.inventory } })).ok).toBe(false)
  expect(storage.getItem(RECOVERY_KEY)).toBe(previous)
  storage.setItem.mockImplementationOnce(() => { throw new Error('quota') })
  expect((await persistence.save({ ...data, inventory: { ...data.inventory } })).ok).toBe(false)
  expect(storage.getItem(RECOVERY_KEY)).toBe(previous)
  expect(blobs.size).toBe(1)
})
it('rechaza una referencia sin datos y no guarda inventarios inválidos', async () => {
  const { storage, inventories, blobs } = setup(), persistence = createRecoveryPersistence(storage, inventories), data = session()
  await persistence.save(data); blobs.clear()
  expect((await persistence.load()).ok).toBe(false)
  data.inventory.lines[0].quantity = Infinity
  expect((await createRecoveryPersistence(storage, inventories).save(data)).ok).toBe(false)
})
it('elimina los datos externos al descartar o sustituir por un inventario pequeño', async () => {
  const { storage, inventories, blobs } = setup(), persistence = createRecoveryPersistence(storage, inventories), data = session()
  await persistence.save(data)
  expect(blobs.size).toBe(1)
  persistence.discard()
  expect(storage.getItem(RECOVERY_KEY)).toBeNull(); expect(blobs.size).toBe(0)
  await persistence.save(data)
  await persistence.save({ ...data, inventory: { name: '', lines: [] } })
  expect(blobs.size).toBe(0)
  expect(JSON.parse(storage.getItem(RECOVERY_KEY)!).version).toBe(1)
})
