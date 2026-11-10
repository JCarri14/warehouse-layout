import { it, expect } from 'vitest'
import { createWarehouse, validateDocument } from '../warehouse/document'
import { decode, encode } from './documentCodec'
it('migrates a v3 warehouse to the default grid and roundtrips custom grids', () => {
  const { gridSizeMm: _grid, ...old } = createWarehouse()
  expect(decode(JSON.stringify({ ...old, version: 3 })).gridSizeMm).toBe(1000)
  const custom = { ...createWarehouse(), gridSizeMm: 500 }
  expect(decode(encode(custom))).toEqual(custom)
  expect(validateDocument({ ...custom, gridSizeMm: 0 })).not.toEqual([])
  expect(validateDocument({ ...custom, gridSizeMm: 10001 })).not.toEqual([])
  expect(() => decode(JSON.stringify({ ...custom, version: 3 }))).toThrow()
})
