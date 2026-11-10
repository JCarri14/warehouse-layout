import { describe, expect, it } from 'vitest'
import { createWarehouse } from '../warehouse/document'
import { decodeRecovery, encodeRecovery, hasRecoverableWork, loadRecovery, saveRecovery, restoreFormDraft } from './recovery'
import type { WorkspaceSnapshot } from '../operations/types'
function session(): WorkspaceSnapshot {
  const warehouse = createWarehouse(), order = { name: 'OT sin título', lines: [] }
  return { warehouse, selected: null, inventory: { name: '', lines: [] }, order, settings: null, mode: 'design', savedWarehouse: JSON.stringify(warehouse), savedOrder: JSON.stringify(order) }
}
describe('recuperación local de sesión', () => {
  it('incluye una OT renombrada vacía y opciones de recorrido como trabajo recuperable', () => {
    const data = session()
    expect(hasRecoverableWork(data)).toBe(false)
    expect(hasRecoverableWork({ ...data, warehouse: { ...data.warehouse, gridSizeMm: 500 } })).toBe(true)
    expect(hasRecoverableWork({ ...data, order: { name: 'Preparación lunes', lines: [] } })).toBe(true)
    expect(hasRecoverableWork({ ...data, settings: { start: { xMm: 500, yMm: 500 }, end: { xMm: 500, yMm: 500 }, returnToStart: true, cellSizeMm: 500 } })).toBe(true)
  })
  it('recupera datos, fecha y punto guardado sin confundirlos con un archivo', () => {
    const data = session(); data.warehouse.name = 'Trabajo pendiente'
    const envelope = decodeRecovery(encodeRecovery(data, '2026-11-09T18:00:00.000Z'))
    expect(envelope.session).toEqual(data)
    expect(envelope.savedAt).toBe('2026-11-09T18:00:00.000Z')
    expect(JSON.parse(envelope.session.savedWarehouse).name).not.toBe(data.warehouse.name)
  })
  it('rechaza copias corruptas, versiones desconocidas y datos operativos inválidos', () => {
    expect(() => decodeRecovery('{')).toThrow()
    expect(() => decodeRecovery('{"format":"optiruta-recovery","version":99}')).toThrow()
    const data = session()
    expect(() => encodeRecovery({ ...data, inventory: { name: 'x', lines: [{ quantity: Infinity } as never] } })).toThrow()
    expect(() => encodeRecovery({ ...data, order: { name: 'x', lines: [null as never] } })).toThrow()
  })
  it('informa fallos de almacenamiento sin fingir que se ha guardado', () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error('quota') }, removeItem: () => {} }
    expect(saveRecovery(storage, session())).toMatchObject({ ok: false })
    expect(loadRecovery({ ...storage, getItem: () => '{' })).toMatchObject({ ok: false })
    expect(loadRecovery(storage)).toMatchObject({ ok: true, envelope: null })
  })
  it('conserva texto pendiente de formulario y descarta estructuras peligrosas', () => {
    const base = { name: 'A', width: '32', levels: [] as unknown[] }
    expect(restoreFormDraft(base, { name: 'Sin aplicar', width: '1,', levels: [] })).toMatchObject({ name: 'Sin aplicar', width: '1,' })
    expect(restoreFormDraft(base, { levels: null, name: { x: 1 } })).toEqual(base)
  })
})
