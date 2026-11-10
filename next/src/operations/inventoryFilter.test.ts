import { expect, it } from 'vitest'
import { exampleWarehouse } from '../warehouse/document'
import { buildInventoryIndex, filterInventory, summarizeInventory } from './inventoryFilter'
import type { DataLine } from './types'

const lines: DataLine[] = [
  { id: '1', reference: 'REF-1', description: 'Torníllo', location: 'A10101', quantity: 2, origin: '' },
  { id: '2', reference: 'REF-2', description: 'Tornillo largo', location: 'B10101', quantity: 3, origin: '' },
  { id: '3', reference: 'REF-3', description: 'Sin plano', location: 'Z90101', quantity: 5, origin: '' },
]
it('combina búsqueda sin acentos, estado y estantería sin modificar los datos', () => {
  const doc = exampleWarehouse(), index = buildInventoryIndex(lines, doc)
  expect(filterInventory(index, 'TORNILLO', 'all', null)).toHaveLength(2)
  const rack = doc.racks.find(rack => rack.code === 'A1')!
  expect(filterInventory(index, 'tornillo', 'placed', rack.id).map(item => item.line.id)).toEqual(['1'])
  expect(filterInventory(index, '', 'unplaced', null).map(item => item.line.id)).toEqual(['3'])
  expect(lines[0].description).toBe('Torníllo')
})
it('resume todas las coincidencias y conserva la firma al cambiar filas dentro de las mismas estanterías', () => {
  const index = buildInventoryIndex(lines, exampleWarehouse())
  const first = summarizeInventory(index, true), reversed = summarizeInventory([...index].reverse(), true)
  expect(first.rackKey).toBe(reversed.rackKey)
  expect(first.resultCount).toBe(3); expect(first.placedCount).toBe(2); expect(first.totalQuantity).toBe(10)
  expect(summarizeInventory([index[0], index[0]], true).rackKey).toBe(summarizeInventory([index[0]], true).rackKey)
  expect(summarizeInventory([], true).rackKey).toBe('[]')
  expect(summarizeInventory(index, false).rackKey).toBe('')
})
