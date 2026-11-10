import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { clampDesignPanels, clampSplitRatio, HANDLE_WIDTH, PANEL_DEFAULTS, readPanelPreference, savePanelPreference, type PanelPreference } from './panelSizing'
import './ResizableWorkspace.css'

type Options = { kind: 'design' | 'split'; storageKey: string; defaultRatio?: number; enabled?: boolean; labels?: [string, string?] }
type Drag = { pointer: number; x: number; before: PanelPreference; start: PanelPreference; handle: number; target: HTMLDivElement; key: string }
const storage = () => { try { return window.localStorage } catch { return null } }

/** Place separators as direct grid children, without adding panel wrappers. */
export function useResizableWorkspace({ kind, storageKey, defaultRatio = .62, enabled = true, labels }: Options) {
  const ref = useRef<HTMLDivElement>(null), drag = useRef<Drag | null>(null)
  const defaults = useMemo(() => ({ ...PANEL_DEFAULTS, ratio: defaultRatio }), [defaultRatio])
  const saved = useMemo(() => readPanelPreference(storage(), storageKey, defaults), [storageKey, defaults])
  const [state, setState] = useState({ key: storageKey, value: saved })
  const preference = state.key === storageKey ? state.value : saved
  const [width, setWidth] = useState(0)
  const [activeHandle, setActiveHandle] = useState<number | null>(null)
  const active = enabled && width > 800
  const sizes = clampDesignPanels(width, preference)
  const ratio = clampSplitRatio(width, preference.ratio)
  const cancel = () => {
    const current = drag.current
    if (!current) return
    drag.current = null
    setState({ key: current.key, value: current.before }); setActiveHandle(null)
    if (current.target.hasPointerCapture(current.pointer)) current.target.releasePointerCapture(current.pointer)
  }
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const measure = () => { if (drag.current) cancel(); setWidth(root.clientWidth) }
    measure()
    const observer = new ResizeObserver(measure); observer.observe(root)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (activeHandle === null) return
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); cancel() } }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  useEffect(() => {
    // A hidden panel or changed workspace ends the gesture without storing partial dimensions.
    return () => {
      const current = drag.current; drag.current = null
      if (current) {
        setState(previous => previous.key === current.key ? { key: current.key, value: current.before } : previous)
        setActiveHandle(null)
      }
      if (current?.target.hasPointerCapture(current.pointer)) current.target.releasePointerCapture(current.pointer)
    }
  }, [storageKey, enabled])
  const update = (next: PanelPreference, persist: boolean) => {
    setState({ key: storageKey, value: next })
    if (persist) savePanelPreference(storage(), storageKey, next)
  }
  const resized = (base: PanelPreference, handle: number, delta: number): PanelPreference => {
    if (kind === 'split') return { ...base, ratio: clampSplitRatio(width, base.ratio + delta / Math.max(1, width - HANDLE_WIDTH)) }
    const next = clampDesignPanels(width, { left: base.left + (handle === 0 ? delta : 0), right: base.right - (handle === 1 ? delta : 0) })
    return { ...base, left: next.left, right: next.right }
  }
  const reset = () => update(defaults, true)
  const down = (event: PointerEvent<HTMLDivElement>, handle: number) => {
    if (event.button !== 0 || drag.current) return
    event.preventDefault(); event.currentTarget.focus()
    const start = kind === 'split' ? { ...preference, ratio } : { ...preference, left: sizes.left, right: sizes.right }
    drag.current = { pointer: event.pointerId, x: event.clientX, before: preference, start, handle, target: event.currentTarget, key: storageKey }
    event.currentTarget.setPointerCapture(event.pointerId); setActiveHandle(handle)
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    if (!current || event.pointerId !== current.pointer) return
    event.preventDefault(); update(resized(current.start, current.handle, event.clientX - current.x), false)
  }
  const up = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    if (!current || event.pointerId !== current.pointer) return
    update(resized(current.start, current.handle, event.clientX - current.x), true)
    drag.current = null; setActiveHandle(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const key = (event: KeyboardEvent<HTMLDivElement>, handle: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return
    event.preventDefault(); event.stopPropagation()
    if (event.key === 'Home') reset()
    else {
      const base = kind === 'split' ? { ...preference, ratio } : { ...preference, left: sizes.left, right: sizes.right }
      update(resized(base, handle, (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 50 : 10)), true)
    }
  }
  const separator = (handle: number) => active ? <div role="separator" aria-orientation="vertical" aria-label={labels?.[handle] ?? (kind === 'split' ? 'Ajustar ancho de datos y plano' : handle === 0 ? 'Ajustar panel de elementos' : 'Ajustar panel de propiedades')} tabIndex={0}
    aria-valuemin={kind === 'split' ? Math.round(300 / (width - HANDLE_WIDTH) * 100) : handle === 0 ? 170 : 230}
    aria-valuemax={kind === 'split' ? Math.round((1 - 300 / (width - HANDLE_WIDTH)) * 100) : Math.round(width - 312 - (handle === 0 ? sizes.right : sizes.left))}
    aria-valuenow={kind === 'split' ? Math.round(ratio * 100) : Math.round(handle === 0 ? sizes.left : sizes.right)}
    className={`panel-separator ${activeHandle === handle ? 'is-dragging' : ''}`} onPointerDown={event => down(event, handle)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel} onDoubleClick={reset} onKeyDown={event => key(event, handle)}><span aria-hidden="true" /></div> : null
  const style: CSSProperties | undefined = active ? { gridTemplateColumns: kind === 'design' ? `${sizes.left}px ${HANDLE_WIDTH}px minmax(300px, 1fr) ${HANDLE_WIDTH}px ${sizes.right}px` : `minmax(300px, ${ratio}fr) ${HANDLE_WIDTH}px minmax(300px, ${1 - ratio}fr)` } : undefined
  return { ref, style, firstSeparator: separator(0), secondSeparator: kind === 'design' ? separator(1) : null }
}
