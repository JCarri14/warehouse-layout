import { expect, it } from 'vitest'
import { appendInventoryToOrder } from './inventoryOrder'
import { draftToLines } from './imports'
const line = { id: 'inventory', reference: 'REF', description: 'Pieza', location: 'A00101', quantity: 2.5, origin: 'Inventario' }
it('añade el lote con cantidades revisadas sin modificar las existencias', () => {
  const order = { name: 'OT activa', lines: [] }
  const next = appendInventoryToOrder(order, [line, { ...line, quantity: 3 }])
  expect(next.lines.map(line => line.quantityText)).toEqual(['2.5', '3'])
  expect(next.lines.every(line => line.origin === order.name)).toBe(true)
  expect(new Set(next.lines.map(line => line.id)).size).toBe(2)
  expect(order.lines).toHaveLength(0)
  expect(line.quantity).toBe(2.5)
})
it('rechaza todo el lote si algún campo o cantidad no es válido', () => {
  const order = { name: 'OT', lines: [] }
  expect(() => appendInventoryToOrder(order, [line, { ...line, description: 'x'.repeat(5000) }])).toThrow('longitud')
  for (const quantity of [0, -1, NaN, Infinity, 1e10]) expect(() => appendInventoryToOrder(order, [{ ...line, quantity }])).toThrow()
  expect(order.lines).toHaveLength(0)
})
it('conserva cantidades pequeñas sin generar notación científica incompatible con la OT', () => {
  const next = appendInventoryToOrder({ name: 'OT', lines: [] }, [{ ...line, quantity: .0000001 }])
  expect(next.lines[0].quantityText).toBe('0.0000001')
  expect(draftToLines(next.lines, '{S}{N}{C}').errors).toHaveLength(0)
})
