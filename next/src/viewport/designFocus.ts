import { allElements, footprint, type WarehouseDocument } from '../warehouse/document'

/** Spatial context only: selecting a zone never assigns or moves its contents. */
export function designFocusIds(doc: WarehouseDocument, selected: string | null): Set<string> | null {
  const elements = allElements(doc), selection = elements.find(element => element.id === selected)
  if (!selection) return null
  const ids = new Set([selection.id])
  if ('kind' in selection && selection.kind === 'zone') {
    const zone = footprint(selection)
    for (const element of elements) {
      const rect = footprint(element)
      if (rect.x < zone.x + zone.w && rect.x + rect.w > zone.x && rect.y < zone.y + zone.d && rect.y + rect.d > zone.y) ids.add(element.id)
    }
  }
  return ids
}
