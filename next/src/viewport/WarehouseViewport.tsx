import { RackAppearance } from './rackAppearance'
import { designFocusIds } from './designFocus'
import { SceneLayers } from './sceneLayers'
import { installElementResize } from './elementResizeInteraction'
import { visibleGridStepMm } from './pointPlacement'
import { createPointPreview } from './pointPreview'
import { t, useLanguage, getLanguage } from '../i18n'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { allElements, elementHeight, footprint, type PlacedElement, type WarehouseDocument } from '../warehouse/document'
import { installDragInteraction, type DragContext } from './dragInteraction'
import type { ResolvedLocation } from '../warehouse/locations'
import { drawAccess } from './accessVisuals'
import { drawBeam, drawRoute } from './routeVisuals'
import type { RouteResult } from '../operations/types'
import type { RouteSettings } from '../operations/types'
import { addDetailedElement } from './detailedVisuals'
import { installPlanInteraction, type PlanActions } from './planInteraction'
import type { WarehouseEdge } from '../warehouse/resize'

type Props = DragContext & PlanActions & { designFocus?: boolean; rackMatches?: readonly string[] | null; onElementResize?: (id: string, edge: WarehouseEdge, delta: number, step: number) => void; onBeginElementResize?: (id: string) => boolean; focusMode?: boolean; selected: string | null; view: 'top' | 'iso'; fit: number; location?: ResolvedLocation; locateRequest: number; route?: RouteResult; activeStop?: number; representation?: 'blocks' | 'detailed'; points?: RouteSettings | null }
export function WarehouseViewport(props: Props) {
  const language = useLanguage()
  const rackFilterKey = props.rackMatches == null ? '' : JSON.stringify([...props.rackMatches].sort())
  const { document: doc, selected, view, fit, tool, snapMm, location, locateRequest } = props
  const host = useRef<HTMLDivElement>(null)
  const sceneState = useRef<{ filterRacks: (ids: string[] | null) => void; refresh: (doc: WarehouseDocument, selected: string | null, location?: ResolvedLocation, route?: RouteResult, activeStop?: number) => void; camera: (view: string) => void; fit: () => void; focusSelection: (id: string) => void; cancel: () => void } | null>(null)
  const contextRef = useRef<Props>(props)
  useLayoutEffect(() => { contextRef.current = props })
  const [hint, setHint] = useState({ message: '', valid: true })
  const [error, setError] = useState('')
  useEffect(() => {
    const element = host.current!
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }) }
    catch { setError('No se ha podido iniciar el visor 3D. Prueba con un navegador con aceleración gráfica. Puedes seguir usando las propiedades y guardar el archivo.'); return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setClearColor('#edf1ef')
    renderer.domElement.setAttribute('aria-label', t('Plano del almacén')); renderer.domElement.tabIndex = 0
    element.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-25, 25, 25, -25, 0.1, 10000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = false; controls.screenSpacePanning = true; controls.minZoom = .1; controls.maxZoom = 40
    controls.maxPolarAngle = Math.PI / 2 - .01
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
    scene.add(new THREE.HemisphereLight('#ffffff', '#89998d', 2.4))
    const light = new THREE.DirectionalLight('#fff5df', 2); light.position.set(15, 30, 10); scene.add(light)
    const group = new THREE.Group(); scene.add(group)
    const layers = new SceneLayers(group)
    const appearances = new Map<string, RackAppearance>()
    let matchingRacks: Set<string> | null = contextRef.current.rackMatches == null ? null : new Set(contextRef.current.rackMatches)
    const applyAppearances = () => {
      let changed = false
      const c = contextRef.current
      const design = c.designFocus ? designFocusIds(c.document, c.selected) : null
      const rackIds = new Set(c.document.racks.map(rack => rack.id))
      for (const [id, appearance] of appearances) {
        const dim = c.designFocus ? !!design && !design.has(id) : rackIds.has(id) && (matchingRacks ? !matchingRacks.has(id) : !!c.focusMode && !!c.selected && c.selected !== id)
        changed = appearance.setDimmed(dim, c.designFocus ? .28 : .58) || changed
      }
      return changed
    }
    let borders: Partial<Record<WarehouseEdge, THREE.LineSegments>> = {}, handles: Partial<Record<WarehouseEdge, THREE.Mesh>> = {}
    let width = 32, depth = 34, height = 0, currentView = 'iso'
    let elementResizer: ReturnType<typeof installElementResize> | undefined
    const render = () => {
      const unitsPerPixel = (camera.top - camera.bottom) / camera.zoom / Math.max(1, element.clientHeight)
      const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
      const occupied: Array<{ x: number; y: number; width: number }> = []
      const priority = (sprite: THREE.Sprite) => Number(sprite.userData.active) * 100 + Number(sprite.userData.priority ?? 0)
      const labels = group.children.filter((child): child is THREE.Sprite => child instanceof THREE.Sprite).sort((a, b) => priority(b) - priority(a))
      labels.forEach(child => {
        if (child.userData.anchor) child.position.copy(child.userData.anchor)
        if (child.userData.priority === 100) child.position.addScaledVector(cameraUp, 20 * unitsPerPixel)
        const labelWidth = Number(child.userData.labelWidth ?? 48)
        child.scale.set(labelWidth * unitsPerPixel, 18 * unitsPerPixel, 1)
        const p = child.position.clone().project(camera), x = (p.x + 1) * element.clientWidth / 2, y = (1 - p.y) * element.clientHeight / 2
        if (child.userData.priority === 100) {
          const clampedX = Math.min(element.clientWidth - labelWidth / 2 - 5, Math.max(labelWidth / 2 + 5, x)), clampedY = Math.min(element.clientHeight - 14, Math.max(14, y))
          child.position.addScaledVector(cameraRight, (clampedX - x) * unitsPerPixel).addScaledVector(cameraUp, (y - clampedY) * unitsPerPixel)
        }
        child.visible = p.z >= -1 && p.z <= 1 && !occupied.some(b => Math.abs(x - b.x) < (labelWidth + b.width) / 2 + 4 && Math.abs(y - b.y) < 23)
        if (child.visible) occupied.push({ x, y, width: labelWidth })
      })
      group.traverse(child => {
        if (child.userData.screenSize) child.scale.setScalar(child.userData.screenSize * unitsPerPixel)
        if (child.userData.laneOffset && child.userData.anchor) child.position.copy(child.userData.anchor).addScaledVector(child.userData.laneOffset, 5 * unitsPerPixel)
      })
      elementResizer?.updateHandles()
      renderer.render(scene, camera)
    }
    const disposeGroup = () => { layers.dispose(); appearances.clear(); scene.remove(group) }
    function box(w: number, h: number, d: number, x: number, y: number, z: number, color: string, id?: string) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: .85, metalness: .05 }))
      mesh.position.set(x, y, z); mesh.userData.id = id; group.add(mesh); return mesh
    }
    function label(text: string, x: number, y: number, z: number, active: boolean, priority = 0) {
      const labelWidth = Math.max(48, Math.min(180, text.length * 7 + 16))
      const c = window.document.createElement('canvas'); c.width = Math.round(labelWidth * 96 / 18); c.height = 96
      const ctx = c.getContext('2d')!
      ctx.fillStyle = active ? '#194d48' : '#fbfcf9'; ctx.beginPath(); ctx.roundRect(3, 3, c.width - 6, 90, 14); ctx.fill()
      ctx.strokeStyle = active ? '#194d48' : '#bccbc3'; ctx.lineWidth = 3; ctx.stroke()
      ctx.fillStyle = active ? '#fbfcf9' : '#273e37'; ctx.font = '600 52px Segoe UI'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, c.width / 2, 49, c.width - 24)
      const texture = new THREE.CanvasTexture(c)
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }))
      sprite.position.set(x, y, z); sprite.scale.set(2.4, .9, 1); sprite.renderOrder = 10; sprite.userData.active = active; sprite.userData.priority = priority; sprite.userData.labelWidth = labelWidth; sprite.userData.anchor = sprite.position.clone(); group.add(sprite)
    }
    const refresh = (document: WarehouseDocument, selection: string | null, focused?: ResolvedLocation, route?: RouteResult, activeStop?: number) => {
      layers.begin()
      const currentLanguage = getLanguage()
      width = document.widthMm / 1000; depth = document.depthMm / 1000
      height = Math.max(0, ...allElements(document).map(e => elementHeight(e) / 1000))
      layers.use('floor', [width, depth, document.gridSizeMm], () => {
      box(width, .12, depth, width / 2, -.1, depth / 2, '#fafbf7')
      const points: THREE.Vector3[] = [], step = visibleGridStepMm(document.widthMm, document.depthMm, document.gridSizeMm ?? 1000) / 1000
      for (let x = 0; x <= width; x += step) points.push(new THREE.Vector3(x, -.025, 0), new THREE.Vector3(x, -.025, depth))
      for (let z = 0; z <= depth; z += step) points.push(new THREE.Vector3(0, -.025, z), new THREE.Vector3(width, -.025, z))
      group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#dce4dd' })))
      })
      for (const [zoneIndex, zone] of (document.zones ?? []).entries()) {
        layers.use(`zone:${zone.id}`, [zone, zoneIndex, zone.id === selection], () => {
        const start = group.children.length
        const b = footprint(zone), w = b.w / 1000, d = b.d / 1000, x = b.x / 1000, z = b.y / 1000, active = zone.id === selection
        const plane = box(w, .008, d, x + w / 2, -.012, z + d / 2, zone.color, zone.id)
        plane.userData.kind = 'zone'; plane.position.y += zoneIndex * .0001; plane.renderOrder = active ? 3 : 1
        const material = plane.material as THREE.MeshStandardMaterial
        material.transparent = true; material.opacity = active ? .3 : .16; material.depthWrite = false
        const border = new THREE.LineSegments(new THREE.EdgesGeometry(plane.geometry), new THREE.LineBasicMaterial({ color: active ? '#8b641f' : zone.color, transparent: true, opacity: active ? 1 : .8 }))
        border.position.copy(plane.position); border.renderOrder = active ? 4 : 2; group.add(border)
        const name = zone.name.length > 25 ? `${zone.name.slice(0, 24)}…` : zone.name
        label(name, x + Math.min(w / 2, 2), .08, z + d - Math.min(.5, d / 2), active)
        appearances.set(zone.id, new RackAppearance(group.children.slice(start)))
        })
      }
      for (const rack of document.racks) {
        const detailed = contextRef.current.representation === 'detailed' && contextRef.current.view === 'iso'
        const rackFocus = focused?.rackId === rack.id ? focused : undefined
        layers.use(`rack:${rack.id}`, [rack, rack.id === selection, rackFocus, detailed, currentLanguage], () => {
        const rackStart = group.children.length
        const b = footprint(rack), x = b.x / 1000, z = b.y / 1000, w = b.w / 1000, d = b.d / 1000, h = elementHeight(rack) / 1000
        const active = rack.id === selection, color = active ? '#d5a640' : rack.color
        if (detailed) addDetailedElement(group, rack, { active })
        else {
        const body = box(w, h, d, x + w / 2, h / 2, z + d / 2, color, rack.id)
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: active ? '#7e5916' : '#34534a', transparent: true, opacity: .6 }))
        edges.position.copy(body.position); group.add(edges)
        // Real levels only; the upper block remains a deliberately simple operational representation.
        for (const level of rack.levels) {
          const y = level.elevationMm / 1000
          box(w + .035, .045, d + .035, x + w / 2, y + .025, z + d / 2, active ? '#f1d18a' : '#adcbc4', rack.id)
        }
        }
        if (active) {
          const outline = box(w + .18, .025, d + .18, x + w / 2, .01, z + d / 2, '#b98b30', rack.id)
          outline.renderOrder = 1
        }
        label(rack.code, x + w / 2, h + .8, z + d / 2, active)
        drawAccess(group, rack, active, focused, label)
        if (active) drawBeam(group, x + w / 2, z + d / 2, h, Math.min(.7, Math.max(.2, d / 2)), 1.25, '#c69432', .2)
        appearances.set(rack.id, new RackAppearance(group.children.slice(rackStart)))
        })
      }

      for (const fixture of document.fixtures ?? []) {
        layers.use(`fixture:${fixture.id}`, [fixture, fixture.id === selection], () => {
        const start = group.children.length
        const b = footprint(fixture), x = b.x / 1000, z = b.y / 1000, w = b.w / 1000, d = b.d / 1000, h = fixture.heightMm / 1000
        const active = fixture.id === selection, color = active ? '#d5a640' : fixture.color
        if (fixture.kind === 'table') {
          const thickness = Math.min(.08, h / 2), leg = Math.min(.08, w * .2, d * .2)
          box(w, thickness, d, x + w / 2, h - thickness / 2, z + d / 2, color, fixture.id)
          for (const lx of [leg, w - leg]) for (const lz of [leg, d - leg]) box(leg, h - thickness, leg, x + lx, (h - thickness) / 2, z + lz, '#52635d', fixture.id)
        } else {
          const body = box(w, h, d, x + w / 2, h / 2, z + d / 2, color, fixture.id)
          const border = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: active ? '#8b641f' : '#53635b' }))
          border.position.copy(body.position); group.add(border)
        }
        if (active) box(w + .15, .02, d + .15, x + w / 2, .01, z + d / 2, '#b98b30', fixture.id)
        label(fixture.code, x + w / 2, h + .7, z + d / 2, active)
        appearances.set(fixture.id, new RackAppearance(group.children.slice(start)))
        })
      }
      if (route) layers.use('route', [route, activeStop], () => drawRoute(group, route, activeStop))
      const endpoints = contextRef.current.points ?? (route?.path.length ? { start: route.path[0], end: route.path.at(-1)!, returnToStart: false } : null)
      layers.use('endpoints', [endpoints?.start.xMm, endpoints?.start.yMm, endpoints?.end.xMm, endpoints?.end.yMm, endpoints?.returnToStart, currentLanguage], () => {
      if (endpoints) for (const kind of ['start', 'end'] as const) {
        const closed = endpoints.returnToStart || endpoints.start.xMm === endpoints.end.xMm && endpoints.start.yMm === endpoints.end.yMm
        if (kind === 'end' && closed) continue
        const point = endpoints[kind], color = kind === 'start' ? '#147a68' : '#8a4e9b'
        const geometry = kind === 'start' ? new THREE.CylinderGeometry(1, 1, .18, 24) : new THREE.BoxGeometry(1.4, .18, 1.4)
        const marker = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, depthTest: false }))
        if (kind === 'end') marker.rotation.y = Math.PI / 4
        marker.position.set(point.xMm / 1000, .18, point.yMm / 1000); marker.userData.endpoint = kind; marker.userData.screenSize = 6; marker.renderOrder = 30; group.add(marker)
        drawBeam(group, point.xMm / 1000, point.yMm / 1000, .2, .55, 1.6, color, .18)
        label(kind === 'start' ? t(closed ? 'Inicio / regreso' : 'Inicio') : t('Destino'), point.xMm / 1000, 1, point.yMm / 1000, false, 100)
      }
      })
      layers.use('borders', [width, depth, contextRef.current.resizeEnabled], () => {
      borders = {}; handles = {}
      if (contextRef.current.resizeEnabled) {
        const edges: [WarehouseEdge, number, number, number, number][] = [['left',0,0,0,depth],['right',width,0,width,depth],['top',0,0,width,0],['bottom',0,depth,width,depth]]
        for (const [edge,x1,z1,x2,z2] of edges) {
          const border = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x1,.05,z1),new THREE.Vector3(x2,.05,z2)]),new THREE.LineBasicMaterial({color:'#739d95'})); group.add(border); borders[edge] = border
          const handle = box(.45,.08,.45,(x1+x2)/2,.1,(z1+z2)/2,'#387f73')
          handle.userData.resizeEdge = edge; handle.renderOrder = 20; (handle.material as THREE.MeshStandardMaterial).depthTest = false; handles[edge] = handle
        }
      }
      })
      layers.end()
      const elementIds = new Set(allElements(document).map(element => element.id))
      for (const id of appearances.keys()) if (!elementIds.has(id)) appearances.delete(id)
      applyAppearances(); render()
    }
    const setCamera = (mode: string) => {
      currentView = mode
      const target = controls.target.clone(), distance = Math.max(width, depth, height) * 1.7 + 10
      camera.up.set(0, 1, 0)
      camera.position.copy(target).add(mode === 'top' ? new THREE.Vector3(0, distance, .001) : new THREE.Vector3(distance * .65, distance * .8, distance * .65))
      controls.enableRotate = mode !== 'top'; camera.lookAt(target); controls.update(); resize()
    }
    const resize = () => {
      const w = element.clientWidth, h = element.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h); const aspect = w / h
      const inverse = camera.quaternion.clone().invert()
      let halfW = 0, halfH = 0
      for (const x of [-width / 2, width / 2]) for (const y of [-height / 2, height / 2]) for (const z of [-depth / 2, depth / 2]) {
        const p = new THREE.Vector3(x, y, z).applyQuaternion(inverse)
        halfW = Math.max(halfW, Math.abs(p.x)); halfH = Math.max(halfH, Math.abs(p.y))
      }
      halfW = halfW * 1.15 + 2; halfH = halfH * 1.15 + 2
      const half = Math.max(halfH, halfW / aspect)
      camera.left = -half * aspect; camera.right = -camera.left
      camera.top = half; camera.bottom = -camera.top
      camera.updateProjectionMatrix(); render()
    }
    const fitScene = () => { controls.target.set(width / 2, height / 2, depth / 2); camera.zoom = 1; setCamera(currentView) }
    const focusSelection = (id: string) => {
      const object = allElements(contextRef.current.document).find(e => e.id === id)
      if (!object) return
      const b = footprint(object), w = b.w / 1000, d = b.d / 1000, h = elementHeight(object) / 1000
      controls.target.set(b.x / 1000 + w / 2, h / 2, b.y / 1000 + d / 2); setCamera(currentView)
      const inverse = camera.quaternion.clone().invert(); let halfW = 0, halfH = 0
      for (const x of [-w / 2, w / 2]) for (const y of [-h / 2, h / 2]) for (const z of [-d / 2, d / 2]) { const p = new THREE.Vector3(x, y, z).applyQuaternion(inverse); halfW = Math.max(halfW, Math.abs(p.x)); halfH = Math.max(halfH, Math.abs(p.y)) }
      camera.zoom = Math.max(.1, Math.min(40, (camera.right - camera.left) / (halfW * 3 + 3), (camera.top - camera.bottom) / (halfH * 3 + 3)))
      camera.updateProjectionMatrix(); controls.update(); render()
    }
    let ghost: THREE.Group | null = null
    const clearGhost = () => {
      if (!ghost) return
      ghost.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) { o.geometry.dispose(); (o.material as THREE.Material).dispose() } })
      scene.remove(ghost); ghost = null
    }
    const preview = (rack: PlacedElement | null, valid: boolean) => {
      if (!rack) { clearGhost(); render(); return }
      const b = footprint(rack), h = Math.max(.04, elementHeight(rack) / 1000)
      if (!ghost) {
        ghost = new THREE.Group()
        const geometry = new THREE.BoxGeometry(b.w / 1000, h, b.d / 1000)
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: .28, depthTest: false, depthWrite: false }))
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ depthTest: false, depthWrite: false }))
        mesh.renderOrder = 50; edges.renderOrder = 51; ghost.add(mesh, edges); scene.add(ghost)
      }
      ghost.position.set((b.x + b.w / 2) / 1000, h / 2, (b.y + b.d / 2) / 1000)
      ghost.children.forEach(child => { const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial; material.color.set(valid ? '#168276' : '#cf423c') })
      render()
    }
    elementResizer = installElementResize({ host: element, canvas: renderer.domElement, scene, camera, controls,
      context: () => ({ enabled: !!contextRef.current.resizeEnabled && !!contextRef.current.onElementResize, document: contextRef.current.document, selected: contextRef.current.selected, view: contextRef.current.view, tool: contextRef.current.tool, snapMm: contextRef.current.snapMm }),
      canBegin: id => contextRef.current.onBeginElementResize?.(id) ?? false,
      commit: (id, edge, delta, step) => contextRef.current.onElementResize?.(id, edge, delta, step),
      dragging: value => contextRef.current.onDragging(value), hint: (message, valid) => setHint({ message, valid }), render
    })
    const pointPreview = createPointPreview(scene, render)
    let resizePreview: THREE.LineSegments | null = null
    const planInteraction = installPlanInteraction({ previewPoint: pointPreview.show, canvas: renderer.domElement, camera, controls,
      context: () => ({ ...contextRef.current, widthMm: contextRef.current.document.widthMm, depthMm: contextRef.current.document.depthMm, gridMm: contextRef.current.document.gridSizeMm ?? 1000 }),
      endpoint: ray => ray.intersectObjects(group.children, true).find(h => h.object.userData.endpoint)?.object.userData.endpoint,
      handleAt: ray => ray.intersectObjects(group.children, true).find(h => h.object.userData.resizeEdge)?.object.userData.resizeEdge,
      solidAt: ray => ray.intersectObjects(group.children, true).some(h => h.object instanceof THREE.Mesh && h.object.userData.id && h.object.userData.kind !== 'zone'),
      hover: edge => {
        for (const key of ['left','right','top','bottom'] as const) {
          const border = borders[key], handle = handles[key]
          if (border) (border.material as THREE.LineBasicMaterial).color.set(edge === key ? '#147a68' : '#739d95')
          if (handle) { (handle.material as THREE.MeshStandardMaterial).color.set(edge === key ? '#147a68' : '#387f73'); handle.scale.setScalar(edge === key ? 1.35 : 1) }
        }
        render()
      },
      hint: (message, valid) => setHint({ message, valid }),
      preview: (edge, delta, valid) => {
        if (resizePreview) { scene.remove(resizePreview); resizePreview.geometry.dispose(); (resizePreview.material as THREE.Material).dispose(); resizePreview = null }
        if (edge) {
          const x = edge === 'left' ? -delta/1000 : 0, z = edge === 'top' ? -delta/1000 : 0, w = width + (edge === 'left' || edge === 'right' ? delta/1000 : 0), d = depth + (edge === 'top' || edge === 'bottom' ? delta/1000 : 0)
          const corners = [new THREE.Vector3(x,.2,z),new THREE.Vector3(x+w,.2,z),new THREE.Vector3(x+w,.2,z+d),new THREE.Vector3(x,.2,z+d)]
          resizePreview = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(corners.flatMap((p,i) => [p,corners[(i+1)%4]])),new THREE.LineBasicMaterial({color:valid?'#147a68':'#c13e32',depthTest:false})); resizePreview.renderOrder=40; scene.add(resizePreview)
        }
        render()
      }
    })
    const interaction = installDragInteraction({ canvas: renderer.domElement, camera, controls, context: () => contextRef.current, pick: ray => {
      const hits = ray.intersectObjects(group.children, true).filter(h => h.object instanceof THREE.Mesh)
      return hits.find(h => h.object.userData.id && h.object.userData.kind !== 'zone') ?? hits.find(h => h.object.userData.kind === 'zone' && h.object.userData.id === contextRef.current.selected) ?? hits.find(h => h.object.userData.kind === 'zone') ?? hits[0]
    }, preview, hint: (message, valid) => setHint({ message, valid }) })
    const observer = new ResizeObserver(() => { elementResizer?.cancel(); planInteraction.cancel(); interaction.cancel(); resize() }); observer.observe(element)
    controls.addEventListener('change', render)
    sceneState.current = { filterRacks: ids => { matchingRacks = ids === null ? null : new Set(ids); if (applyAppearances()) render() }, refresh, camera: setCamera, fit: fitScene, focusSelection, cancel: () => { elementResizer?.cancel(); planInteraction.cancel(); interaction.cancel() } }
    refresh(doc, selected); fitScene()
    return () => {
      sceneState.current = null; observer.disconnect(); elementResizer?.dispose(); planInteraction.dispose(); interaction.dispose(); clearGhost(); controls.dispose(); disposeGroup(); renderer.dispose(); renderer.domElement.remove()
    }
    // Scene lifecycle is independent from document updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { sceneState.current?.cancel() }, [doc, view, tool, snapMm, fit, locateRequest, props.resizeEnabled, props.picking])
  useEffect(() => { sceneState.current?.refresh(doc, selected, location, props.route, props.activeStop) }, [doc, selected, location, props.route, props.activeStop, props.representation, props.points, props.resizeEnabled, props.focusMode, props.designFocus, view, language])
  useEffect(() => { sceneState.current?.filterRacks(rackFilterKey ? JSON.parse(rackFilterKey) : null) }, [rackFilterKey])
  useEffect(() => { sceneState.current?.camera(view) }, [view])
  const tallest = Math.max(0, ...allElements(doc).map(elementHeight))
  useEffect(() => { sceneState.current?.fit() }, [fit, doc.id, doc.widthMm, doc.depthMm, tallest])
  useEffect(() => { const current = contextRef.current.location; if (locateRequest && current) sceneState.current?.focusSelection(current.rackId) }, [locateRequest])
  return <><div className="viewport" ref={host}>{error && <div className="viewport-error" role="alert">{t(error)}</div>}</div>{hint.message && <div className={`drag-status ${hint.valid ? '' : 'invalid'}`} role="status">{t(hint.message)}</div>}</>
}
