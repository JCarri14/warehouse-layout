import { afterEach, describe, expect, it } from 'vitest'
import { getLanguage, locale, setLanguage, t } from './index'
import { csvLines, buildReport } from '../operations/reports'
import { formatQuantity, parseQuantity, parseDelimited, guessMapping } from '../operations/imports'
import { createWarehouse, metres } from '../warehouse/document'
afterEach(() => setLanguage('es'))
describe('idiomas de la aplicación', () => {
  it('traduce pistas de arrastre, errores adicionales y unidades parametrizadas', () => {
    setLanguage('en')
    expect(t('X {0} · Y {1} · Suelta para colocar', { 0: '1 ft', 1: '2 ft' })).toBe('X 1 ft · Y 2 ft · Release to place')
    expect(t('Posición no válida · Se conservará la anterior')).toBe('Invalid position · The previous position will be kept')
    expect(t('No se puede proyectar esta posición sobre el plano.')).toBe('This position cannot be projected onto the plan.')
    expect(t('Movimiento cancelado.')).toBe('Move cancelled.')
    expect(t('No se puede reducir: quedarían elementos fuera.')).toBe('Cannot shrink: some elements would be outside.')
    expect(t('Y {0} errores más.', { 0: 3 })).toBe('And 3 more errors.')
    expect(t('Cota ({0})', { 0: 'ft' })).toBe('Elevation (ft)')
    expect(t('Abierto: {0}. Los datos permanecen en este dispositivo.', { 0: 'Nave del Norte.json' })).toBe('Opened: Nave del Norte.json. Data stays on this device.')
    expect(t('Añadir estantería.')).toBe('Add rack.')
    expect(t('Deshecho: Añadir estantería.')).toBe('Undone: Add rack.')
    setLanguage('es')
    expect(t('Y {0} errores más.', { 0: 3 })).toBe('Y 3 errores más.')
    expect(t('Cota ({0})', { 0: 'cm' })).toBe('Cota (cm)')
    expect(t('Undone: Add rack.')).toBe('Deshecho: Añadir estantería.')
  })
  it('changes language and formats interface copy without touching unknown data', () => {
    expect(getLanguage()).toBe('es')
    expect(t('Guardar almacén')).toBe('Guardar almacén')
    setLanguage('en')
    expect(locale()).toBe('en-GB')
    expect(t('Guardar almacén')).toBe('Save warehouse')
    expect(t('REF-1182 / Almacén de Joan')).toBe('REF-1182 / Almacén de Joan')
    expect(t('Código nivel {0}', { 0: 3 })).toBe('Level 3 code')
    expect(t('Fila 7: comillas sin cerrar.')).toBe('Row 7: unclosed quotation marks.')
    expect(t('Usa {S}, o {L} y {E}, para definir la sección; no ambas formas.')).toContain('{S}')
  })
  it('uses language-specific display decimals while accepting both input separators', () => {
    setLanguage('en')
    expect(formatQuantity(2.7)).toBe('2.7')
    expect(metres(2700)).toBe('2.7')
    expect(parseQuantity('2,7')).toBe(2.7)
    expect(parseQuantity('2.7')).toBe(2.7)
    expect(guessMapping(parseDelimited('referencia;ubicacion;unidades\nP;A10101;2\n')).quantity).toBe(2)
  })
  it('retranslates existing interface messages when changing language', () => {
    setLanguage('en')
    const message = t('Fila 7: comillas sin cerrar.')
    setLanguage('es')
    expect(t(message)).toBe('Fila 7: comillas sin cerrar.')
  })
  it('exports translated report headings while preserving item and warehouse names', () => {
    setLanguage('en')
    const warehouse = createWarehouse(); warehouse.name = 'Nave del Norte'
    const lines = [{ id: 'a', reference: 'REF-1', description: 'Tornillo español', location: 'A10101', quantity: 2.7, origin: 'OT Madrid' }]
    expect(csvLines(lines)).toContain('Reference;Description;Location;Quantity;Source')
    expect(csvLines(lines)).toContain('Tornillo español')
    const text = buildReport({ warehouse, name: 'Informe de Joan', kind: 'inventory', lines }).output()
    expect(text).toContain('Inventory')
    expect(text).toContain('Nave del Norte')
    expect(text).toContain('Tornillo espa')
    expect(text).toContain('Generated:')
    expect(text).toContain('Page 1 /')
  })
})
