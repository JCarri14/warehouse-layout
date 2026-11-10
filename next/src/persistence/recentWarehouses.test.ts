import { describe, expect, it, vi } from 'vitest'
import { createWarehouse } from '../warehouse/document'
import { encode } from './documentCodec'
import { openRecentWarehouse, type RecentWarehouse } from './recentWarehouses'
import type { LocalFileHandle } from './localFiles'

const entry = (): RecentWarehouse => { const doc = createWarehouse(); return { id: doc.id, name: doc.name, updatedAt: 1, source: encode(doc) } }
describe('abrir almacenes recientes', () => {
  it('valida y abre una copia local sin vincularla a un archivo', async () => {
    const recent = entry(), opened = await openRecentWarehouse(recent)
    expect(opened.document.id).toBe(recent.id)
    expect(opened.handle).toBeUndefined()
    await expect(openRecentWarehouse({ ...recent, source: '{}' })).rejects.toThrow()
  })
  it('solicita acceso y lee el archivo actual, no la copia antigua', async () => {
    const current = { ...createWarehouse(), name: 'Archivo actualizado' }
    const handle = { name: 'warehouse.json', requestPermission: vi.fn(async () => 'granted'), getFile: async () => ({ size: 100, text: async () => encode(current) }) } as unknown as LocalFileHandle
    const opened = await openRecentWarehouse({ ...entry(), handle })
    expect(opened.document.name).toBe('Archivo actualizado')
    expect(opened.handle).toBe(handle)
  })
  it('no abre silenciosamente una copia obsoleta si el permiso falla', async () => {
    const handle = { requestPermission: async () => 'denied', getFile: vi.fn() } as unknown as LocalFileHandle
    await expect(openRecentWarehouse({ ...entry(), handle })).rejects.toThrow('acceso')
    expect(handle.getFile).not.toHaveBeenCalled()
  })
})
