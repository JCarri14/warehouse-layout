export type PanelPreference = { left: number; right: number; ratio: number }
export const PANEL_DEFAULTS: PanelPreference = { left: 260, right: 360, ratio: .62 }
export const HANDLE_WIDTH = 6
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max))

export function clampDesignPanels(width: number, value: Pick<PanelPreference, 'left' | 'right'>) {
  const available = Math.max(700, width - HANDLE_WIDTH * 2)
  const left = clamp(value.left, 170, available - 300 - 230)
  const right = clamp(value.right, 230, available - 300 - left)
  return { left, right, center: available - left - right }
}
export function clampSplitRatio(width: number, ratio: number) {
  const available = Math.max(600, width - HANDLE_WIDTH)
  return clamp(ratio, 300 / available, 1 - 300 / available)
}
export function readPanelPreference(storage: Pick<Storage, 'getItem'> | null, key: string, defaults = PANEL_DEFAULTS): PanelPreference {
  try {
    const value: unknown = JSON.parse(storage?.getItem(key) ?? 'null')
    if (!value || typeof value !== 'object') return { ...defaults }
    const raw = value as Record<string, unknown>
    if (typeof raw.left !== 'number' || !Number.isFinite(raw.left) || raw.left < 170 || raw.left > 10000 || typeof raw.right !== 'number' || !Number.isFinite(raw.right) || raw.right < 230 || raw.right > 10000 || typeof raw.ratio !== 'number' || !Number.isFinite(raw.ratio) || raw.ratio <= 0 || raw.ratio >= 1) return { ...defaults }
    return { left: raw.left, right: raw.right, ratio: raw.ratio }
  } catch { return { ...defaults } }
}
export function savePanelPreference(storage: Pick<Storage, 'setItem'> | null, key: string, value: PanelPreference) {
  try { storage?.setItem(key, JSON.stringify(value)); return !!storage } catch { return false }
}
