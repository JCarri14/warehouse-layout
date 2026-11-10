import * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { t } from '../i18n'
import { formatMeasure, getMeasurementUnit } from '../measurements'
import { allElements, footprint, type PlacedElement, type WarehouseDocument } from '../warehouse/document'
import type { WarehouseEdge } from '../warehouse/resize'
import { elementResizeCandidate, resizeElement } from '../editor/elementResize'

type Context = { enabled: boolean; document: WarehouseDocument; selected: string | null; view: string; tool: string; snapMm: number }
export function installElementResize(o: {
  host: HTMLElement; canvas: HTMLCanvasElement; scene: THREE.Scene; camera: THREE.OrthographicCamera; controls: OrbitControls
  context: () => Context; canBegin: (id: string) => boolean; commit: (id: string, edge: WarehouseEdge, delta: number, step: number) => void
  dragging: (value: boolean) => void; hint: (message: string, valid: boolean) => void; render: () => void
}) {
  const root = document.createElement('div'); root.className = 'element-size-handles'; o.host.append(root)
  const edges = ['left', 'right', 'top', 'bottom'] as const
  const names = { left: 'Izquierda', right: 'Derecha', top: 'Arriba', bottom: 'Abajo' }
  let space = false
  let gesture: { pointer: number; button: HTMLButtonElement; doc: WarehouseDocument; element: PlacedElement; edge: WarehouseEdge; anchor: THREE.Vector3; step: number; delta: number; valid: boolean; moved: boolean; x: number; y: number; candidate?: PlacedElement } | null = null
  let preview: THREE.Group | null = null
  const buttons = edges.map(edge => {
    const button = document.createElement('button'); button.type = 'button'; button.className = `element-size-handle size-${edge}`; button.hidden = true
    root.append(button)
    button.addEventListener('pointerdown', event => down(event, edge, button))
    button.addEventListener('keydown', event => keyboard(event, edge))
    return button
  })
  const current = () => {
    const c = o.context()
    return c.enabled && c.view === 'top' && c.tool === 'select' ? allElements(c.document).find(element => element.id === c.selected) : undefined
  }
  const ground = (event: PointerEvent) => {
    const rect = o.canvas.getBoundingClientRect(), ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), o.camera)
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3())
  }
  const clearPreview = () => {
    if (!preview) return
    o.scene.remove(preview)
    preview.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) { object.geometry.dispose(); (object.material as THREE.Material).dispose() } })
    preview = null
  }
  const drawPreview = (candidate: PlacedElement, valid: boolean) => {
    if (!preview) {
      preview = new THREE.Group()
      const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
      const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: .2, depthTest: false, depthWrite: false, side: THREE.DoubleSide }))
      const border = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }))
      fill.renderOrder = 60; border.renderOrder = 61; preview.add(fill, border); o.scene.add(preview)
    }
    const rect = footprint(candidate)
    preview.position.set((rect.x + rect.w / 2) / 1000, .08, (rect.y + rect.d / 2) / 1000)
    preview.scale.set(Math.max(.001, Math.abs(rect.w) / 1000), 1, Math.max(.001, Math.abs(rect.d) / 1000))
    preview.children.forEach(object => { ((object as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(valid ? '#168276' : '#c13e32') })
    o.render()
  }
  function updateHandles() {
    const selected = current(), element = selected && gesture?.candidate && gesture.valid ? gesture.candidate : selected, rect = element ? footprint(element) : null
    buttons.forEach((button, index) => {
      button.hidden = !element || !rect || space
      if (!element || !rect || space) return
      const edge = edges[index]
      const x = edge === 'left' ? rect.x : edge === 'right' ? rect.x + rect.w : rect.x + rect.w / 2
      const y = edge === 'top' ? rect.y : edge === 'bottom' ? rect.y + rect.d : rect.y + rect.d / 2
      const projected = new THREE.Vector3(x / 1000, .08, y / 1000).project(o.camera)
      button.hidden = projected.z < -1 || projected.z > 1
      button.style.left = `${(projected.x + 1) * o.host.clientWidth / 2}px`; button.style.top = `${(1 - projected.y) * o.host.clientHeight / 2}px`
      button.setAttribute('aria-label', t('Redimensionar {0}: {1}', { 0: element.code, 1: t(names[edge]) }))
      button.title = t('Arrastra o usa las flechas para cambiar el tamaño. Escape cancela.')
    })
  }
  const clear = () => {
    const old = gesture; gesture = null; clearPreview(); o.controls.enabled = true
    if (old) { if (old.button.hasPointerCapture(old.pointer)) old.button.releasePointerCapture(old.pointer); o.dragging(false); o.hint('', true) }
    o.render()
  }
  function down(event: PointerEvent, edge: WarehouseEdge, button: HTMLButtonElement) {
    if (event.button !== 0 || gesture || space) return
    event.preventDefault(); event.stopImmediatePropagation()
    const element = current(), anchor = ground(event)
    if (!element || !anchor || !o.canBegin(element.id)) return
    const c = o.context()
    gesture = { pointer: event.pointerId, button, doc: c.document, element, edge, anchor, step: c.snapMm, delta: 0, valid: true, moved: false, x: event.clientX, y: event.clientY }
    o.controls.enabled = false; button.focus({ preventScroll: true }); button.setPointerCapture(event.pointerId); o.dragging(true)
  }
  const update = (event: PointerEvent) => {
    const g = gesture, point = ground(event)
    if (!g || !point) return
    if (!g.moved && Math.hypot(event.clientX - g.x, event.clientY - g.y) < 4) return
    g.moved = true
    g.delta = (g.edge === 'left' ? g.anchor.x - point.x : g.edge === 'right' ? point.x - g.anchor.x : g.edge === 'top' ? g.anchor.z - point.z : point.z - g.anchor.z) * 1000
    const candidate = elementResizeCandidate(g.element, g.edge, g.delta, g.step)
    let error = ''
    try { resizeElement(g.doc, g.element.id, g.edge, g.delta, g.step); g.valid = true } catch (cause) { g.valid = false; error = (cause as Error).message }
    g.candidate = candidate
    drawPreview(candidate, g.valid)
    const rect = footprint(candidate)
    o.hint(g.valid ? t('{0} · {1} × {2} {3} · Suelta para cambiar el tamaño', { 0: g.element.code, 1: formatMeasure(rect.w), 2: formatMeasure(rect.d), 3: getMeasurementUnit() }) : error, g.valid)
  }
  const move = (event: PointerEvent) => { if (gesture?.pointer === event.pointerId) { event.preventDefault(); event.stopImmediatePropagation(); update(event) } }
  const up = (event: PointerEvent) => {
    if (gesture?.pointer !== event.pointerId) return
    event.preventDefault(); event.stopImmediatePropagation(); update(event)
    const final = gesture; clear()
    if (final.moved && final.valid) o.commit(final.element.id, final.edge, final.delta, final.step)
  }
  function keyboard(event: KeyboardEvent, edge: WarehouseEdge) {
    const horizontal = edge === 'left' || edge === 'right', negative = horizontal ? 'ArrowLeft' : 'ArrowUp', positive = horizontal ? 'ArrowRight' : 'ArrowDown'
    if (event.key !== negative && event.key !== positive) return
    event.preventDefault(); event.stopPropagation()
    const element = current(), c = o.context()
    if (!element || !o.canBegin(element.id)) return
    const step = c.snapMm || 1, delta = (event.key === positive ? 1 : -1) * (edge === 'left' || edge === 'top' ? -1 : 1) * step
    try { resizeElement(c.document, element.id, edge, delta, c.snapMm); o.commit(element.id, edge, delta, c.snapMm) } catch (error) { o.hint((error as Error).message, false) }
  }
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && gesture) { event.preventDefault(); event.stopImmediatePropagation(); clear() }
    if (event.code === 'Space' && event.target === o.canvas && !gesture) { space = true; updateHandles() }
  }
  const keyup = (event: KeyboardEvent) => { if (event.code === 'Space') { space = false; updateHandles() } }
  const lost = () => { if (gesture) clear() }
  const blur = () => { space = false; if (gesture) clear(); updateHandles() }
  root.addEventListener('pointermove', move); root.addEventListener('pointerup', up); root.addEventListener('pointercancel', lost); root.addEventListener('lostpointercapture', lost)
  window.addEventListener('keydown', key, true); window.addEventListener('keyup', keyup, true); window.addEventListener('blur', blur)
  return { updateHandles, cancel: () => { if (gesture) clear() }, dispose: () => {
    if (gesture) clear(); clearPreview(); root.remove()
    window.removeEventListener('keydown', key, true); window.removeEventListener('keyup', keyup, true); window.removeEventListener('blur', blur)
  } }
}
