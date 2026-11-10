import type { WarehouseDocument } from '../warehouse/document'
import { resolveLocation } from '../warehouse/locations'
import type { DataLine } from './types'

export const inventorySearchText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
export type IndexedInventoryLine = { line: DataLine; index: number; location: ReturnType<typeof resolveLocation>; search: string }
export type InventoryFilterSummary = { active: boolean; resultCount: number; placedCount: number; totalQuantity: number; rackKey: string }

export function buildInventoryIndex(lines: DataLine[], warehouse: WarehouseDocument): IndexedInventoryLine[] {
  const locations = new Map<string, ReturnType<typeof resolveLocation>>()
  return lines.map((line, index) => {
    let location = locations.get(line.location)
    if (!location) { location = resolveLocation(warehouse, line.location); locations.set(line.location, location) }
    return { line, index, location, search: inventorySearchText(`${line.reference} ${line.description} ${line.location}`) }
  })
}
/** Filtering preserves the precomputed sort order; no text normalization per row while typing. */
export function filterInventory(index: IndexedInventoryLine[], query: string, status: string, rackId: string | null) {
  const needle = inventorySearchText(query.trim())
  return index.filter(item => (!needle || item.search.includes(needle)) && (status === 'all' || (status === 'placed' ? item.location.ok : !item.location.ok)) && (!rackId || item.location.ok && item.location.rackId === rackId))
}
export function summarizeInventory(matches: IndexedInventoryLine[], active: boolean): InventoryFilterSummary {
  const racks = new Set<string>()
  let placedCount = 0, totalQuantity = 0
  for (const item of matches) {
    totalQuantity += item.line.quantity
    if (item.location.ok) { racks.add(item.location.rackId); placedCount++ }
  }
  return { active, resultCount: matches.length, placedCount, totalQuantity, rackKey: active ? JSON.stringify([...racks].sort()) : '' }
}
