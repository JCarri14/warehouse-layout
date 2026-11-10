import { t } from '../i18n'
import { pointCell, type PointCell } from './pointPlacement'
import { formatMeasure, getMeasurementUnit, lengthText } from '../measurements'
import * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Point } from '../operations/types'
import { resizeDelta, type WarehouseEdge } from '../warehouse/resize'

export type PlanActions = {
  allowPointDrag?: boolean;
  picking?: 'start' | 'end' | null; resizeEnabled?: boolean;
  onPoint?: (kind: 'start' | 'end', point: Point) => void;
  onCancelPoint?: () => void;
  onResize?: (edge: WarehouseEdge, delta: number) => void;
  validateResize?: (edge: WarehouseEdge, delta: number) => boolean;
  validatePoint?: (point: Point) => boolean;
}
export function installPlanInteraction(o: {
  canvas: HTMLCanvasElement; camera: THREE.OrthographicCamera; controls: OrbitControls;
  context: () => PlanActions & { widthMm: number; depthMm: number; gridMm: number; tool?: 'select' | 'pan' };
  endpoint: (ray: THREE.Raycaster) => 'start' | 'end' | undefined;
  handleAt?: (ray: THREE.Raycaster) => WarehouseEdge | undefined;
  solidAt?: (ray: THREE.Raycaster) => boolean;
  hover?: (edge: WarehouseEdge | null) => void;
  previewPoint?: (cell: PointCell | null, kind?: 'start' | 'end', valid?: boolean) => void;
  preview: (edge: WarehouseEdge | null, delta: number, valid: boolean) => void;
  hint: (message: string, valid: boolean) => void;
}) {
  type Gesture = { pointer: number; anchor: Point; edge?: WarehouseEdge; kind?: 'start' | 'end'; delta: number; point: Point; valid: boolean }
  let gesture: Gesture | null = null
  let space = false, hovered: WarehouseEdge | null = null
  const ray = (event: PointerEvent) => {
    const b = o.canvas.getBoundingClientRect(), r = new THREE.Raycaster()
    r.setFromCamera(new THREE.Vector2((event.clientX - b.left) / b.width * 2 - 1, -(event.clientY - b.top) / b.height * 2 + 1), o.camera)
    return r
  }
  const ground = (r: THREE.Raycaster): Point | null => {
    const p = r.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3())
    return p ? { xMm: Math.round(p.x * 1000), yMm: Math.round(p.z * 1000) } : null
  }
  const hover = (edge: WarehouseEdge | null) => {
    o.canvas.style.cursor = edge ? edge === 'left' || edge === 'right' ? 'ew-resize' : 'ns-resize' : space || o.context().tool === 'pan' ? 'grab' : o.context().picking ? 'crosshair' : 'default'
    if (edge === hovered) return
    hovered = edge; o.hover?.(edge)
  }
  const edgeAt = (p: Point, r: THREE.Raycaster): WarehouseEdge | undefined => {
    const c = o.context()
    if (!c.resizeEnabled || space || c.tool === 'pan') return
    const tolerance = (o.camera.top - o.camera.bottom) / o.camera.zoom / Math.max(1, o.canvas.clientHeight) * 8000
    const candidates: [WarehouseEdge, number][] = [['left', Math.abs(p.xMm)], ['right', Math.abs(p.xMm - c.widthMm)], ['top', Math.abs(p.yMm)], ['bottom', Math.abs(p.yMm - c.depthMm)]]
    const nearest = candidates.sort((a, b) => a[1] - b[1])[0]
    // Avoid raycasting dense rack contents when the pointer is far from any edge.
    const broad = Math.max(400, tolerance)
    if (nearest[1] > broad || p.xMm < -broad || p.xMm > c.widthMm + broad || p.yMm < -broad || p.yMm > c.depthMm + broad) return
    const handle = o.handleAt?.(r)
    if (handle) return handle
    if (nearest[1] > tolerance || p.xMm < -tolerance || p.xMm > c.widthMm + tolerance || p.yMm < -tolerance || p.yMm > c.depthMm + tolerance || o.solidAt?.(r)) return
    return nearest[0]
  }
  const hidePoint = () => { o.previewPoint?.(null) }
  const showPoint = (raw: Point, kind: 'start' | 'end') => {
    const c = o.context(), cell = pointCell(raw, c.widthMm, c.depthMm, c.gridMm)
    const valid = cell.inside && (c.validatePoint?.(cell.point) ?? true)
    o.previewPoint?.(cell, kind, valid)
    o.canvas.style.cursor = valid ? 'crosshair' : 'not-allowed'
    o.hint(valid ? t('{0} provisional · X {1} · Y {2}', { 0: t(kind === 'start' ? 'Inicio' : 'Destino'), 1: lengthText(cell.point.xMm), 2: lengthText(cell.point.yMm) }) : t('Elige una casilla libre dentro del almacén.'), valid)
    return { point: cell.point, valid }
  }
  const clear = () => {
    const old = gesture; gesture = null; o.controls.enabled = true; o.preview(null, 0, true); hidePoint(); o.hint('', true)
    if (old && o.canvas.hasPointerCapture(old.pointer)) o.canvas.releasePointerCapture(old.pointer)
    hover(null)
  }
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || gesture) return
    const c = o.context()
    if (space || c.tool === 'pan') return
    const r = ray(event), p = ground(r)
    if (!p) return
    const edge = edgeAt(p, r)
    const kind = c.picking ?? (c.allowPointDrag === false ? undefined : o.endpoint(r))
    if (!edge && !kind) return
    event.preventDefault(); event.stopImmediatePropagation(); o.canvas.focus({ preventScroll: true }); o.controls.enabled = false
    gesture = { pointer: event.pointerId, anchor: p, point: p, edge, kind: kind ?? undefined, delta: 0, valid: true }
    o.canvas.setPointerCapture(event.pointerId)
    update(p)
  }
  const update = (point: Point) => {
    if (!gesture) return
    const c = o.context(), g = gesture; g.point = point
    if (g.edge) {
      const raw = g.edge === 'left' ? g.anchor.xMm - point.xMm : g.edge === 'right' ? point.xMm - g.anchor.xMm : g.edge === 'top' ? g.anchor.yMm - point.yMm : point.yMm - g.anchor.yMm
      g.delta = resizeDelta(raw, c.gridMm); g.valid = c.validateResize?.(g.edge, g.delta) ?? true
      o.preview(g.edge, g.delta, g.valid)
      const w = c.widthMm + (g.edge === 'left' || g.edge === 'right' ? g.delta : 0), d = c.depthMm + (g.edge === 'top' || g.edge === 'bottom' ? g.delta : 0)
      o.hint(g.valid ? `${formatMeasure(w)} × ${formatMeasure(d)} ${getMeasurementUnit()}` : 'No se puede reducir: quedarían elementos fuera.', g.valid)
    } else if (g.kind) {
      const preview = showPoint(point, g.kind); g.point = preview.point; g.valid = preview.valid
    }
  }
  const move = (event: PointerEvent) => {
    const r = ray(event), p = ground(r)
    if (gesture?.pointer === event.pointerId) { event.preventDefault(); event.stopImmediatePropagation(); if (p) update(p) }
    else if (!gesture && !event.buttons) {
      const c = o.context()
      if (p && c.picking && !space && c.tool !== 'pan') showPoint(p, c.picking)
      else { hidePoint(); hover(p ? edgeAt(p, r) ?? null : null) }
    } else if (!gesture) { hidePoint(); o.hint('', true) }
  }
  const up = (event: PointerEvent) => {
    if (gesture?.pointer !== event.pointerId) return
    event.preventDefault(); event.stopImmediatePropagation(); const p = ground(ray(event)); if (p) update(p); else gesture.valid = false; const g = gesture; clear()
    if (!g.valid) { if (g.kind && p) showPoint(p, g.kind); else o.hint(g.edge ? 'No se puede reducir: quedarían elementos fuera.' : 'Elige una casilla libre dentro del almacén.', false); return }
    if (g.edge && g.delta) o.context().onResize?.(g.edge, g.delta)
    else if (g.kind) o.context().onPoint?.(g.kind, g.point)
  }
  const cancel = () => { clear(); hover(null) }
  const lostCapture = () => { if (gesture) cancel() }
  const key = (event: KeyboardEvent) => {
    if (event.code === 'Space' && event.target === o.canvas) { space = true; hidePoint(); o.hint('', true); hover(null) }
    if (event.key === 'Escape' && (gesture || o.context().picking)) { event.preventDefault(); event.stopImmediatePropagation(); clear(); o.context().onCancelPoint?.() }
  }
  const keyup = (event: KeyboardEvent) => { if (event.code === 'Space') space = false }
  const blur = () => { space = false; cancel(); hover(null) }
  const leave = () => { if (!gesture) { hidePoint(); o.hint('', true); hover(null) } }
  const wheel = () => { if (!gesture) { hidePoint(); o.hint('', true) } }
  o.canvas.addEventListener('pointerdown', down, true); o.canvas.addEventListener('pointermove', move, true); o.canvas.addEventListener('pointerup', up, true)
  o.canvas.addEventListener('pointercancel', cancel); o.canvas.addEventListener('lostpointercapture', lostCapture)
  o.canvas.addEventListener('pointerleave', leave); o.canvas.addEventListener('wheel', wheel, true)
  window.addEventListener('keydown', key, true); window.addEventListener('keyup', keyup, true); window.addEventListener('blur', blur)
  return { cancel, dispose: () => {
    clear(); o.canvas.removeEventListener('pointerdown', down, true); o.canvas.removeEventListener('pointermove', move, true); o.canvas.removeEventListener('pointerup', up, true)
    o.canvas.removeEventListener('pointercancel', cancel); o.canvas.removeEventListener('lostpointercapture', lostCapture)
    o.canvas.removeEventListener('pointerleave', leave); o.canvas.removeEventListener('wheel', wheel, true)
    window.removeEventListener('keydown', key, true); window.removeEventListener('keyup', keyup, true); window.removeEventListener('blur', blur)
  } }
}
