import { describe, expect, it } from 'vitest'
import { createHistory, pushHistory, undoHistory, redoHistory } from './history'

describe('historial de documentos', () => {
  it('deshace y rehace acciones completas con su etiqueta', () => {
    let h = createHistory({ x: 0 })
    h = pushHistory(h, { x: 100 }, 'Mover estantería')
    expect(h.past).toHaveLength(1)
    h = undoHistory(h)
    expect(h.present).toEqual({ x: 0 }); expect(h.future[0].label).toBe('Mover estantería')
    h = redoHistory(h)
    expect(h.present).toEqual({ x: 100 }); expect(h.future).toHaveLength(0)
  })
  it('ignora valores equivalentes y borra la rama de rehacer solo con una nueva acción', () => {
    const initial = createHistory({ x: 0 })
    expect(pushHistory(initial, { x: 0 }, 'Nada')).toBe(initial)
    let h = undoHistory(pushHistory(initial, { x: 1 }, 'Primera'))
    expect(pushHistory(h, { x: 0 }, 'Nada')).toBe(h)
    h = pushHistory(h, { x: 2 }, 'Otra')
    expect(h.future).toHaveLength(0)
    expect(redoHistory(h)).toBe(h)
  })
  it('limita el historial y no retrocede por debajo del primer estado disponible', () => {
    let h = createHistory(0)
    for (let i = 1; i <= 105; i++) h = pushHistory(h, i, 'Editar')
    expect(h.past).toHaveLength(100)
    for (let i = 0; i < 100; i++) h = undoHistory(h)
    expect(h.present).toBe(5); expect(undoHistory(h)).toBe(h)
  })
})
