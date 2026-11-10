import { describe, expect, it } from 'vitest'
import type { RouteSettings } from '../operations/types'
import { createWarehouse } from '../warehouse/document'
import { resizeSession } from './resizeSession'

const settings: RouteSettings = { start: { xMm: 500, yMm: 500 }, end: { xMm: 31500, yMm: 33500 }, cellSizeMm: 250, returnToStart: true }

describe('redimensionado con puntos de recorrido', () => {
  it.each(['left', 'top'] as const)('desplaza ambos puntos al ampliar %s, incluido destino de ruta cerrada', edge => {
    const doc = createWarehouse(), before = structuredClone(settings)
    const result = resizeSession(doc, settings, edge, 1600, 1000)
    expect(result.settings).toEqual({ ...settings, start: { xMm: 500 + (edge === 'left' ? 2000 : 0), yMm: 500 + (edge === 'top' ? 2000 : 0) }, end: { xMm: 31500 + (edge === 'left' ? 2000 : 0), yMm: 33500 + (edge === 'top' ? 2000 : 0) } })
    expect(settings).toEqual(before)
  })
  it.each(['left', 'right', 'top', 'bottom'] as const)('impide recortar el punto de %s sin necesidad de objetos', edge => {
    expect(() => resizeSession(createWarehouse(), settings, edge, -1000, 1000)).toThrow(/inicio o el destino/)
  })
  it('no cambia puntos si se amplía por derecha o abajo y conserva ajustes de cálculo', () => {
    expect(resizeSession(createWarehouse(), settings, 'right', 1000, 1000).settings).toBe(settings)
    expect(resizeSession(createWarehouse(), settings, 'bottom', 1000, 1000).settings).toBe(settings)
  })
  it('conserva referencias ante movimiento nulo y admite sesiones sin puntos', () => {
    const doc = createWarehouse()
    expect(resizeSession(doc, settings, 'left', 100, 1000)).toEqual({ document: doc, settings })
    expect(resizeSession(doc, null, 'left', 1000, 1000).settings).toBeNull()
  })
})
