import { t } from '../i18n'
import { validateDataLines } from '../operations/imports'
import type { DataSet, WorkspaceSnapshot } from '../operations/types'
import { decodeRecovery, encodeRecovery, loadRecovery, RECOVERY_KEY, saveRecovery } from './recovery'
import type { RecoveryInventories } from './recoveryInventories'

const errorMessage = () => t('No se ha podido actualizar la copia local. Guarda archivos independientes; el navegador puede estar sin espacio o tener el almacenamiento bloqueado.')
type Result = { ok: true; savedAt: string } | { ok: false; message: string }
export function hasExternalInventory(storage: Pick<Storage, 'getItem'>) {
  try { return JSON.parse(storage.getItem(RECOVERY_KEY) ?? 'null')?.version === 2 } catch { return false }
}

/** Large immutable inventories are written once; metadata commits only after their transaction. */
export function createRecoveryPersistence(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, inventories: RecoveryInventories) {
  let cached: { data: DataSet; id: string } | null = null
  const cleanup = (id: string) => inventories.remove(id).catch(() => {})
  return {
    discard() {
      let id = cached?.id
      if (!id) { try { id = JSON.parse(storage.getItem(RECOVERY_KEY) ?? 'null')?.inventoryRef } catch { /* Corrupt metadata can still be discarded. */ } }
      storage.removeItem(RECOVERY_KEY)
      cached = null
      if (id) void cleanup(id)
    },
    async load(): Promise<ReturnType<typeof loadRecovery>> {
      try {
        const source = storage.getItem(RECOVERY_KEY), raw = source ? JSON.parse(source) : null
        if (raw?.version !== 2) return loadRecovery(storage)
        if (raw.format !== 'optiruta-recovery' || typeof raw.inventoryRef !== 'string' || !raw.inventoryRef || !raw.session) throw new Error('Invalid recovery reference')
        const inventory = await inventories.get(raw.inventoryRef)
        if (!inventory) throw new Error('Missing inventory')
        const envelope = decodeRecovery(JSON.stringify({ ...raw, version: 1, session: { ...raw.session, inventory } }))
        cached = { data: envelope.session.inventory, id: raw.inventoryRef }
        return { ok: true, envelope }
      } catch { return { ok: false, message: t('No se ha podido leer la copia local. Puede estar dañada o el almacenamiento no está disponible.') } }
    },
    async save(session: WorkspaceSnapshot): Promise<Result> {
      if (session.inventory.lines.length <= 1000) {
        const result = saveRecovery(storage, session)
        if (result.ok && cached) { const previous = cached; cached = null; void cleanup(previous.id) }
        return result
      }
      let newId: string | undefined
      try {
        const savedAt = new Date().toISOString()
        const manifest = JSON.parse(encodeRecovery({ ...session, inventory: { name: session.inventory.name, lines: [] } }, savedAt))
        let id = cached?.data === session.inventory ? cached.id : undefined
        if (!id) {
          if (!validateDataLines(session.inventory.lines)) throw new Error('Invalid inventory')
          newId = crypto.randomUUID(); id = newId
          await inventories.put(id, session.inventory)
        }
        storage.setItem(RECOVERY_KEY, JSON.stringify({ ...manifest, version: 2, inventoryRef: id }))
        const previous = cached
        cached = { data: session.inventory, id }
        if (previous && previous.id !== id) void cleanup(previous.id)
        return { ok: true, savedAt }
      } catch {
        if (newId) await cleanup(newId)
        return { ok: false, message: errorMessage() }
      }
    },
  }
}
