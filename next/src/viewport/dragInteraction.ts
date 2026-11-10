import { lengthText } from '../measurements'
import { t } from '../i18n'
import * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { moveElement, snapCoordinate } from '../editor/commands'
import { allElements, type PlacedElement, type WarehouseDocument } from '../warehouse/document'

export type DragContext = {
  document: WarehouseDocument; tool: 'select' | 'pan'; snapMm: number;
  onSelect: (id: string | null) => void; onBegin: (id: string) => boolean;
  onMove: (id: string, x: number, y: number) => void; onDragging: (active: boolean) => void;
  onFeedback: (message: string, error: boolean) => void;
}
type Options = {
  canvas: HTMLCanvasElement; camera: THREE.Camera; controls: OrbitControls;
  context: () => DragContext; pick: (ray: THREE.Raycaster) => THREE.Intersection | undefined;
  preview: (rack: PlacedElement | null, valid: boolean) => void; hint: (message: string, valid: boolean) => void;
}
export function installDragInteraction(o: Options) {
  let space = false
  let click: { x: number; y: number; id: number; eligible: boolean } | null = null
  let drag: { pointer: number; startX: number; startY: number; anchor: THREE.Vector3; plane: THREE.Plane; document: WarehouseDocument; rack: PlacedElement; x: number; y: number; step: number; moved: boolean; valid: boolean; error: string } | null = null
  const ray = (e: PointerEvent) => {
    const b = o.canvas.getBoundingClientRect(), r = new THREE.Raycaster()
    r.setFromCamera(new THREE.Vector2((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1), o.camera)
    return r
  }
  const cursor = () => { o.canvas.style.cursor = space || o.context().tool === 'pan' ? 'grab' : 'default' }
  const clear = () => {
    const pointer = drag?.pointer
    drag = null; click = null; o.preview(null, true); o.hint('', true); o.controls.enabled = true
    if (pointer !== undefined && o.canvas.hasPointerCapture(pointer)) o.canvas.releasePointerCapture(pointer)
    o.context().onDragging(false); cursor()
  }
  const down = (e: PointerEvent) => {
    if (drag) { e.preventDefault(); e.stopImmediatePropagation(); return }
    const c = o.context()
    click = { x: e.clientX, y: e.clientY, id: e.pointerId, eligible: e.button === 0 && c.tool === 'select' && !space }
    if (!click.eligible) return
    const hit = o.pick(ray(e)), id = hit?.object.userData.id as string | undefined
    const rack = allElements(c.document).find(r => r.id === id)
    if (!hit || !rack) return
    e.preventDefault(); e.stopImmediatePropagation(); o.canvas.focus({ preventScroll: true })
    if (!c.onBegin(rack.id)) { click = null; return }
    drag = { pointer: e.pointerId, startX: e.clientX, startY: e.clientY, anchor: hit.point.clone(), plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y), document: c.document, rack, x: rack.xMm, y: rack.yMm, step: c.snapMm, moved: false, valid: true, error: '' }
    o.controls.enabled = false; o.canvas.setPointerCapture(e.pointerId); o.canvas.style.cursor = 'grabbing'; c.onDragging(true)
  }
  const move = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointer) return
    e.preventDefault(); e.stopImmediatePropagation()
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4) return
    drag.moved = true
    const point = ray(e).ray.intersectPlane(drag.plane, new THREE.Vector3())
    if (!point) { drag.valid = false; drag.error = t('No se puede proyectar esta posición sobre el plano.'); o.hint(drag.error, false); return }
    drag.x = snapCoordinate(drag.rack.xMm + (point.x - drag.anchor.x) * 1000, drag.step)
    drag.y = snapCoordinate(drag.rack.yMm + (point.z - drag.anchor.z) * 1000, drag.step)
    try { moveElement(drag.document, drag.rack.id, drag.x, drag.y); drag.valid = true; drag.error = '' }
    catch (e) { drag.valid = false; drag.error = (e as Error).message }
    o.preview({ ...drag.rack, xMm: drag.x, yMm: drag.y }, drag.valid)
    o.hint(drag.valid ? t('X {0} · Y {1} · Suelta para colocar', { 0: lengthText(drag.x), 1: lengthText(drag.y) }) : t('Posición no válida · Se conservará la anterior'), drag.valid)
  }
  const up = (e: PointerEvent) => {
    if (drag && drag.pointer === e.pointerId) {
      e.preventDefault(); e.stopImmediatePropagation()
      const final = drag; clear()
      if (final.moved) {
        if (final.valid) o.context().onMove(final.rack.id, final.x, final.y)
        else o.context().onFeedback(final.error, true)
      }
      return
    }
    if (click?.id === e.pointerId && click.eligible && Math.hypot(e.clientX - click.x, e.clientY - click.y) <= 4) {
      o.context().onSelect((o.pick(ray(e))?.object.userData.id as string | undefined) ?? null)
    }
    click = null
  }
  const cancel = () => { if (drag) clear(); else { click = null; cursor() } }
  const interrupted = () => { if (drag) { clear(); o.context().onFeedback(t('Movimiento cancelado.'), false) } }
  const keydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && drag) { e.preventDefault(); e.stopImmediatePropagation(); interrupted() }
    if (e.code === 'Space' && e.target === o.canvas && !drag) { e.preventDefault(); space = true; cursor() }
  }
  const keyup = (e: KeyboardEvent) => { if (e.code === 'Space') { space = false; cursor() } }
  const blur = () => { space = false; interrupted(); cursor() }
  const wheel = (e: WheelEvent) => { if (drag) { e.preventDefault(); e.stopImmediatePropagation() } }
  o.canvas.addEventListener('pointerdown', down, true)
  o.canvas.addEventListener('pointermove', move, true)
  o.canvas.addEventListener('pointerup', up, true)
  o.canvas.addEventListener('pointercancel', interrupted)
  o.canvas.addEventListener('lostpointercapture', interrupted)
  o.canvas.addEventListener('wheel', wheel, { capture: true, passive: false })
  window.addEventListener('keydown', keydown, true); window.addEventListener('keyup', keyup); window.addEventListener('blur', blur)
  cursor()
  return {
    cancel,
    dispose: () => {
      cancel(); o.canvas.removeEventListener('pointerdown', down, true); o.canvas.removeEventListener('pointermove', move, true); o.canvas.removeEventListener('pointerup', up, true)
      o.canvas.removeEventListener('pointercancel', interrupted); o.canvas.removeEventListener('lostpointercapture', interrupted); o.canvas.removeEventListener('wheel', wheel, true)
      window.removeEventListener('keydown', keydown, true); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', blur)
    },
  }
}
