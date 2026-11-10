import { expect, it, vi } from 'vitest'
import { saveLocalWarehouse, type LocalFileHandle } from './localFiles'
import { createWarehouse } from '../warehouse/document'
it('actualiza el mismo handle sin abrir otro selector ni cambiar el nombre', async () => {
  const saved: string[] = [], picker = vi.fn()
  const handle: LocalFileHandle = { name:'almacen.json', getFile:vi.fn(), createWritable:async () => ({write:async source => {saved.push(source)},close:async()=>{}}) }
  const doc = createWarehouse()
  await saveLocalWarehouse(doc,handle,undefined,{showSaveFilePicker:picker})
  await saveLocalWarehouse({...doc,name:'Actualizado'},handle,undefined,{showSaveFilePicker:picker})
  expect(picker).not.toHaveBeenCalled(); expect(saved).toHaveLength(2)
  expect(JSON.parse(saved[1]).name).toBe('Actualizado')
})
it('cancelar el selector no escribe y un fallo de escritura aborta sin cerrar', async () => {
  const doc = createWarehouse(), abort=vi.fn(), close=vi.fn()
  expect(await saveLocalWarehouse(doc,undefined,undefined,{showSaveFilePicker:async()=>{throw new DOMException('Cancel','AbortError')}})).toBeNull()
  const handle: LocalFileHandle = {name:'a.json',getFile:vi.fn(),createWritable:async()=>({write:async()=>{throw new Error('disk full')},abort,close})}
  await expect(saveLocalWarehouse(doc,handle)).rejects.toThrow('disk full')
  expect(abort).toHaveBeenCalledOnce(); expect(close).not.toHaveBeenCalled()
})
