import { afterEach, describe, expect, it } from 'vitest'
import { convertMeasurementDraft, formatMeasure, parseMeasure, setMeasurementUnit, type MeasurementUnit } from './measurements'
afterEach(() => setMeasurementUnit('m'))
describe('unidades de presentación con almacenamiento en milímetros', () => {
  it('convierte las cinco unidades y acepta coma decimal', () => {
    expect(parseMeasure('1,5', 'm')).toBe(1500)
    expect(parseMeasure('25.4', 'mm')).toBe(25)
    expect(parseMeasure('2.54', 'cm')).toBe(25)
    expect(parseMeasure('1', 'ft')).toBe(305)
    expect(parseMeasure('1', 'in')).toBe(25)
  })
  it('no altera medidas al mostrar y volver a aplicar cualquier unidad', () => {
    for (const unit of ['m', 'cm', 'mm', 'ft', 'in'] as MeasurementUnit[]) {
      for (const mm of [0, 1, 17, 1400, 32000, 1234567]) expect(parseMeasure(formatMeasure(mm, unit), unit)).toBe(mm)
    }
  })
  it('rechaza medidas inválidas y desbordamientos', () => {
    for (const value of ['', '-1', '2x', '1e9', 'Infinity', '1.2.3', '99999999999999999999']) expect(() => parseMeasure(value, 'm')).toThrow()
  })
  it('recupera borradores antiguos en metros y conserva el significado de los nuevos', () => {
    setMeasurementUnit('cm')
    expect(convertMeasurementDraft({ width: '2', name: 'Almacén', levels: [{ code: '01', elevation: '1,4' }] })).toEqual({ width: '200', name: 'Almacén', levels: [{ code: '01', elevation: '140' }] })
    setMeasurementUnit('m')
    expect(convertMeasurementDraft({ __unit: 'cm', width: '350', height: '' })).toMatchObject({ width: '3,5', height: '' })
  })
})
