import { describe, expect, it } from 'vitest'
import { clampDesignPanels, clampSplitRatio, PANEL_DEFAULTS, readPanelPreference, savePanelPreference } from './panelSizing'

describe('anchos ajustables de paneles', () => {
  it('respeta mínimos de los laterales y del plano al estrechar la ventana', () => {
    const panels = clampDesignPanels(800, { left: 500, right: 500 })
    expect(panels.left).toBeGreaterThanOrEqual(170); expect(panels.right).toBeGreaterThanOrEqual(230)
    expect(panels.center).toBeGreaterThanOrEqual(300)
    expect(panels.left + panels.right + panels.center + 12).toBe(800)
  })
  it('acota la división para conservar ambas áreas y recupera tamaños grandes', () => {
    expect(clampSplitRatio(1000, .95)).toBeCloseTo(1 - 300 / 994)
    expect(clampSplitRatio(1000, .05)).toBeCloseTo(300 / 994)
    expect(clampDesignPanels(1800, { left: 400, right: 450 })).toMatchObject({ left: 400, right: 450 })
  })
  it('guarda preferencias independientes por sección sin depender del almacén', () => {
    const data = new Map<string, string>(), storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
    savePanelPreference(storage, 'inventory', { left: 218, right: 292, ratio: .7 })
    savePanelPreference(storage, 'route', { left: 218, right: 292, ratio: .4 })
    expect(readPanelPreference(storage, 'inventory').ratio).toBe(.7)
    expect(readPanelPreference(storage, 'route').ratio).toBe(.4)
    expect(readPanelPreference(storage, 'reports')).toEqual(PANEL_DEFAULTS)
  })
  it('ignora almacenamiento corrupto, valores no finitos y errores de cuota', () => {
    for (const raw of ['{', '[]', '{"left":218,"right":292,"ratio":4}', '{"left":null,"right":292,"ratio":0.5}']) expect(readPanelPreference({ getItem: () => raw }, 'key')).toEqual(PANEL_DEFAULTS)
    expect(readPanelPreference({ getItem: () => { throw Error('blocked') } }, 'key')).toEqual(PANEL_DEFAULTS)
    expect(savePanelPreference({ setItem: () => { throw Error('quota') } }, 'key', PANEL_DEFAULTS)).toBe(false)
  })
})
