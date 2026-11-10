import { t } from '../i18n'
import { footprint, type WarehouseDocument } from '../warehouse/document'
import { resolveLocation } from '../warehouse/locations'
import type { DataLine, Point, RouteResult, RouteSettings } from './types'

const MAX_CELLS = 160_000
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const validPoint = (v: unknown): v is Point => typeof v === 'object' && v !== null && finite((v as Point).xMm) && finite((v as Point).yMm)
export function validateRouteSettings(v: unknown): v is RouteSettings {
  if (typeof v !== 'object' || v === null) return false
  const s = v as RouteSettings
  return validPoint(s.start) && validPoint(s.end) && typeof s.returnToStart === 'boolean' && finite(s.cellSizeMm) && Number.isSafeInteger(s.cellSizeMm) && s.cellSizeMm >= 1
}
const solids = (doc: WarehouseDocument) => [...doc.racks, ...(doc.fixtures ?? [])].map(footprint)
export function pointIsFree(doc: WarehouseDocument, point: Point): boolean {
  return validPoint(point) && point.xMm >= 0 && point.yMm >= 0 && point.xMm <= doc.widthMm && point.yMm <= doc.depthMm && !solids(doc).some(b => point.xMm >= b.x && point.xMm <= b.x + b.w && point.yMm >= b.y && point.yMm <= b.y + b.d)
}
function grid(doc: WarehouseDocument, size: number) {
  const cols = Math.ceil(doc.widthMm / size), rows = Math.ceil(doc.depthMm / size)
  if (!Number.isSafeInteger(cols * rows) || cols * rows > MAX_CELLS || cols < 1 || rows < 1) throw new Error(t('La malla supera 160.000 celdas. Aumenta el tamaño de celda.'))
  const blocked = new Uint8Array(cols * rows)
  for (const b of solids(doc)) {
    for (let y = Math.max(0, Math.floor(b.y / size)); y < Math.min(rows, Math.ceil((b.y + b.d) / size)); y++)
      for (let x = Math.max(0, Math.floor(b.x / size)); x < Math.min(cols, Math.ceil((b.x + b.w) / size)); x++) blocked[y * cols + x] = 1
  }
  const center = (node: number): Point => {
    const x = node % cols, y = Math.floor(node / cols)
    return { xMm: (x * size + Math.min((x + 1) * size, doc.widthMm)) / 2, yMm: (y * size + Math.min((y + 1) * size, doc.depthMm)) / 2 }
  }
  const nodeAt = (p: Point) => Math.min(rows - 1, Math.floor(p.yMm / size)) * cols + Math.min(cols - 1, Math.floor(p.xMm / size))
  return { cols, rows, blocked, center, nodeAt, size }
}
type Grid = ReturnType<typeof grid>
const length = (a: Point, b: Point) => Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm)
export function automaticRouteCellSize(doc: WarehouseDocument): number {
  const cellSizeMm = Math.max(250, Math.ceil(Math.sqrt(doc.widthMm * doc.depthMm / 120_000)))
  // Increasing the resolution until ceil(width/size)*ceil(depth/size) fits also handles very narrow warehouses.
  let size = cellSizeMm
  while (Math.ceil(doc.widthMm / size) * Math.ceil(doc.depthMm / size) > MAX_CELLS) size++
  return size
}
export function defaultRouteSettings(doc: WarehouseDocument): RouteSettings {
  const size = automaticRouteCellSize(doc)
  const g = grid(doc, size)
  for (let y = g.rows - 1; y >= 0; y--) for (let x = 0; x < g.cols; x++) {
    const node = y * g.cols + x
    if (!g.blocked[node]) { const point = g.center(node); return { start: point, end: { ...point }, returnToStart: true, cellSizeMm: size } }
  }
  throw new Error(t('No hay ninguna celda libre para iniciar una ruta. Revisa los pasillos y el espacio disponible.'))
}
// Binary heap holds only discovered frontier entries; one search is retained at a time.
function shortest(g: Grid, from: number, targets: Set<number>, keepParents = false) {
  const distances = new Float64Array(g.blocked.length).fill(Infinity)
  const parents = keepParents ? new Int32Array(g.blocked.length).fill(-1) : null
  const heap: { node: number; distance: number }[] = []
  const less = (a: { node: number; distance: number }, b: { node: number; distance: number }) => a.distance < b.distance || (a.distance === b.distance && a.node < b.node)
  const push = (node: number, distance: number) => {
    const entry = { node, distance }; let i = heap.length; heap.push(entry)
    while (i > 0) { const p = (i - 1) >> 1; if (!less(entry, heap[p])) break; heap[i] = heap[p]; i = p }
    heap[i] = entry
  }
  const pop = () => {
    const first = heap[0], last = heap.pop()!
    if (heap.length) { let i = 0; while (i * 2 + 1 < heap.length) { let child = i * 2 + 1; if (child + 1 < heap.length && less(heap[child + 1], heap[child])) child++; if (!less(heap[child], last)) break; heap[i] = heap[child]; i = child } heap[i] = last }
    return first
  }
  const pending = new Set(targets)
  distances[from] = 0; push(from, 0)
  while (heap.length && pending.size) {
    const { node, distance } = pop()
    if (distance !== distances[node]) continue
    pending.delete(node)
    const x = node % g.cols, y = Math.floor(node / g.cols), a = g.center(node)
    const neighbors = [x > 0 ? node - 1 : -1, x + 1 < g.cols ? node + 1 : -1, y > 0 ? node - g.cols : -1, y + 1 < g.rows ? node + g.cols : -1]
    for (const next of neighbors) {
      if (next < 0 || g.blocked[next]) continue
      const candidate = distance + length(a, g.center(next))
      if (candidate < distances[next]) { distances[next] = candidate; if (parents) parents[next] = node; push(next, candidate) }
    }
  }
  return { distances, parents }
}
function visitOrder(d: number[][], n: number): number[] {
  if (n === 0) return []
  if (n <= 16) {
    const states = 1 << n, dp = new Float64Array(states * n).fill(Infinity), pred = new Int8Array(states * n).fill(-1)
    for (let j = 0; j < n; j++) dp[(1 << j) * n + j] = d[0][j + 1]
    for (let mask = 1; mask < states; mask++) for (let j = 0; j < n; j++) {
      if (!(mask & (1 << j))) continue
      const cost = dp[mask * n + j]
      for (let k = 0; k < n; k++) if (!(mask & (1 << k))) {
        const idx = (mask | (1 << k)) * n + k, next = cost + d[j + 1][k + 1]
        if (next < dp[idx]) { dp[idx] = next; pred[idx] = j }
      }
    }
    let mask = states - 1, last = 0
    for (let j = 1; j < n; j++) if (dp[mask * n + j] + d[j + 1][n + 1] < dp[mask * n + last] + d[last + 1][n + 1]) last = j
    const order: number[] = []
    while (last >= 0) { order.push(last + 1); const previous = pred[mask * n + last]; mask ^= 1 << last; last = previous }
    return order.reverse()
  }
  const order: number[] = [], remaining = new Set(Array.from({ length: n }, (_, i) => i + 1))
  let at = 0
  while (remaining.size) { let next = -1; for (const candidate of remaining) if (next < 0 || d[at][candidate] < d[at][next]) next = candidate; order.push(next); remaining.delete(next); at = next }
  for (let pass = 0; pass < 100; pass++) {
    let changed = false
    for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
      const a = i ? order[i - 1] : 0, b = order[i], c = order[j], e = j === n - 1 ? n + 1 : order[j + 1]
      if (d[a][c] + d[b][e] < d[a][b] + d[c][e] - 1e-8) { order.splice(i, j - i + 1, ...order.slice(i, j + 1).reverse()); changed = true }
    }
    if (!changed) break
  }
  return order
}
export function calculateRoute(doc: WarehouseDocument, lines: DataLine[], settings: RouteSettings): RouteResult {
  if (!validateRouteSettings(settings)) throw new Error(t('Configuración de ruta inválida: revisa inicio, destino y tamaño entero de celda en milímetros.'))
  const g = grid(doc, settings.cellSizeMm)
  const endpoint = (p: Point, label: string) => {
    if (!pointIsFree(doc, p)) throw new Error(t(`El ${label} debe quedar dentro del almacén y fuera de estanterías y obstáculos.`))
    const node = g.nodeAt(p)
    if (g.blocked[node]) throw new Error(t(`La celda de ${label} está ocupada. Mueve el punto a una zona más despejada.`))
    return node
  }
  const startNode = endpoint(settings.start, 'inicio')
  // Validate the saved end even for a return route so recovery cannot hide an invalid setting.
  const requestedEnd = endpoint(settings.end, 'destino'), endNode = settings.returnToStart ? startNode : requestedEnd
  const end = settings.returnToStart ? settings.start : settings.end
  const grouped = new Map<number, { lines: DataLine[]; rackIds: string[] }>()
  const obstacles = solids(doc)
  for (const line of lines) {
    if (!finite(line.quantity) || line.quantity <= 0) throw new Error(t(`Cantidad inválida en ${line.reference || line.id}. Debe ser mayor que cero.`))
    const resolved = resolveLocation(doc, line.location)
    if (!resolved.ok) throw new Error(`${line.location}: ${resolved.message}`)
    const p = resolved.point, s = g.size
    // First whole cell on the configured outward normal, preserving the face's tangential coordinate.
    const col = p.normalX > 0 ? Math.ceil(p.xMm / s) : p.normalX < 0 ? Math.floor(p.xMm / s) - 1 : Math.min(g.cols - 1, Math.floor(p.xMm / s))
    const row = p.normalY > 0 ? Math.ceil(p.yMm / s) : p.normalY < 0 ? Math.floor(p.yMm / s) - 1 : Math.min(g.rows - 1, Math.floor(p.yMm / s))
    const node = row * g.cols + col
    if (col < 0 || col >= g.cols || row < 0 || row >= g.rows || g.blocked[node]) throw new Error(t(`${line.location}: acceso bloqueado en la cara configurada. Revisa el pasillo y la cara de acceso.`))
    const c = g.center(node)
    // The short outward access may cross a rounded blocked strip but must never cross a physical fixture or another rack.
    const outward = p.normalX ? { xMm: c.xMm, yMm: p.yMm } : { xMm: p.xMm, yMm: c.yMm }
    const intersects = (a: Point, b: Point) => obstacles.some(r => a.xMm === b.xMm
      ? a.xMm > r.x && a.xMm < r.x + r.w && Math.max(a.yMm, b.yMm) > r.y && Math.min(a.yMm, b.yMm) < r.y + r.d
      : a.yMm > r.y && a.yMm < r.y + r.d && Math.max(a.xMm, b.xMm) > r.x && Math.min(a.xMm, b.xMm) < r.x + r.w)
    if (intersects(p, outward) || intersects(outward, c)) throw new Error(t(`${line.location}: acceso bloqueado por un elemento físico.`))
    const group = grouped.get(node) ?? { lines: [], rackIds: [] }
    group.lines.push({ ...line }); if (!group.rackIds.includes(resolved.rackId)) group.rackIds.push(resolved.rackId)
    grouped.set(node, group)
  }
  if (grouped.size > 200) throw new Error(t('La ruta admite hasta 200 paradas únicas.'))
  const groups = [...grouped], nodes = [startNode, ...groups.map(([node]) => node), endNode], n = groups.length
  const targets = new Set(nodes), d: number[][] = []
  for (const node of nodes) {
    const { distances } = shortest(g, node, targets)
    const row = nodes.map(target => distances[target])
    if (row.some(v => !Number.isFinite(v))) throw new Error(t('Una ubicación o el destino no tiene acceso por los pasillos. Revisa los obstáculos y la anchura de los pasillos.'))
    d.push(row)
  }
  const order = visitOrder(d, n), path: Point[] = [], stops: RouteResult['stops'] = []
  const append = (p: Point) => { if (!path.length || length(path[path.length - 1], p) > 0) path.push({ ...p }) }
  append(settings.start)
  append(g.center(startNode))
  let distanceMm = length(settings.start, g.center(startNode)), previous = 0
  for (const next of [...order, n + 1]) {
    const from = nodes[previous], to = nodes[next]
    if (from !== to) {
      const { parents } = shortest(g, from, new Set([to]), true), segment: number[] = []
      for (let at = to; at !== from; at = parents![at]) { if (at < 0) throw new Error(t('No se pudo reconstruir el pasillo.')); segment.push(at) }
      for (const node of segment.reverse()) append(g.center(node))
    }
    distanceMm += d[previous][next]
    if (next <= n) { const group = groups[next - 1][1]; stops.push({ index: stops.length + 1, point: g.center(to), lines: group.lines, rackIds: [...group.rackIds], distanceMm }) }
    previous = next
  }
  append(end); distanceMm += length(g.center(endNode), end)
  // Identical points need no artificial out-and-back connector when there are no pickups.
  if (!n && settings.start.xMm === end.xMm && settings.start.yMm === end.yMm) { path.splice(0, path.length, { ...settings.start }); distanceMm = 0 }
  const warnings = [t(`Ruta sobre malla de ${g.size} mm; las celdas que tocan volumen físico se consideran ocupadas. Las paradas representan el pasillo de recogida, no el interior de la estantería.`), t('La optimización mide desplazamiento horizontal; no incluye tiempos de recogida ni elevación.')]
  if (n > 16) warnings.push(t('Orden aproximado: vecino más cercano y mejora 2-opt (más de 16 paradas).'))
  return { path, stops, distanceMm, exact: n <= 16, cellSizeMm: g.size, warnings }
}
