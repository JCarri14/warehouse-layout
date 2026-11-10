import { expect, it } from 'vitest'
import { pointCell } from './pointPlacement'

it('sitúa el punto en el centro de la casilla visible', () => {
  expect(pointCell({ xMm: 12200, yMm: 12900 }, 32000, 34000, 1000)).toMatchObject({ point: { xMm: 12500, yMm: 12500 }, xMm: 12000, yMm: 12000, widthMm: 1000, depthMm: 1000, inside: true })
})
it('usa el centro real de una casilla parcial y no lleva posiciones exteriores al interior', () => {
  expect(pointCell({ xMm: 32200, yMm: 600 }, 32500, 34000, 1000)).toMatchObject({ point: { xMm: 32250, yMm: 500 }, widthMm: 500, inside: true })
  expect(pointCell({ xMm: -1, yMm: 100 }, 32000, 34000, 1000).inside).toBe(false)
  expect(pointCell({ xMm: 32501, yMm: 100 }, 32500, 34000, 1000).inside).toBe(false)
})
it('coincide con la cuadrícula simplificada de los planos grandes', () => {
  expect(pointCell({ xMm: 2500, yMm: 2500 }, 400000, 400000, 1000)).toMatchObject({ xMm: 0, yMm: 0, widthMm: 3000, depthMm: 3000, point: { xMm: 1500, yMm: 1500 } })
})
