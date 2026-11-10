import { formatMeasure, getMeasurementUnit } from '../measurements'
import { APP_NAME } from '../brand'
import { t, locale } from '../i18n'
import { jsPDF } from 'jspdf'
import { footprint } from '../warehouse/document'
import type { WarehouseDocument } from '../warehouse/document'
import { accessFace } from '../warehouse/locations'
import { formatQuantity } from './imports'
import type { DataLine, RouteResult } from './types'

export type ReportOptions = { warehouse: WarehouseDocument; kind: 'warehouse' | 'inventory' | 'order' | 'route'; lines: DataLine[]; name: string; route?: RouteResult; generatedAt?: Date }
const kindNames = { warehouse: 'Plano del almacén', inventory: 'Inventario', order: 'Orden de trabajo', route: 'Ruta de preparación' }
const control = (char: string) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
const clean = (text: string) => [...text].map(char => control(char) ? ' ' : char).join('').replace(/\s+/g, ' ').trim()
// Prefix dangerous text before quoting it: quoting alone does not prevent Excel formulas.
function csvText(value: string): string {
  const first = [...value].find(char => !control(char) && !/\s/.test(char)) ?? ''
  const safe = (first && '=+-@'.includes(first)) || (value && control(value[0])) ? "'" + value : value
  return /[;"\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe
}
function csv(rows: string[][]): string { return '\uFEFF' + rows.map(row => row.join(';')).join('\r\n') + '\r\n' }
function dataCells(line: DataLine): string[] { return [csvText(line.reference), csvText(line.description), csvText(line.location), formatQuantity(line.quantity), csvText(line.origin)] }
export function csvLines(lines: DataLine[]): string {
  return csv([[t('Referencia'), t('Descripción'), t('Ubicación'), t('Cantidad'), t('Origen')], ...lines.map(dataCells)])
}
export function routeCsv(route: RouteResult): string {
  return csv([[t('Parada'), t('Distancia ({0})', { 0: getMeasurementUnit() }), t('Referencia'), t('Descripción'), t('Ubicación'), t('Cantidad'), t('Origen')], ...route.stops.flatMap(stop => stop.lines.map(line => [String(stop.index), formatMeasure(stop.distanceMm), ...dataCells(line)]))])
}

export function buildReport(options: ReportOptions): jsPDF {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: false })
  const { warehouse, route } = options, margin = 12, pageWidth = 297, pageHeight = 210, contentWidth = pageWidth - margin * 2
  const title = clean(options.name) || t(kindNames[options.kind])
  const date = new Intl.DateTimeFormat(locale(), { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' }).format(options.generatedAt ?? new Date())
  pdf.setProperties({ title, subject: t(kindNames[options.kind]), creator: APP_NAME, author: APP_NAME })
  const fitText = (text: string, x: number, y: number, width: number, size: number) => {
    pdf.setFontSize(size)
    const lines: string[] = pdf.splitTextToSize(clean(text), width)
    // Titles have a bounded single line; full document titles remain in PDF metadata.
    let shown = lines[0] ?? ''
    if (lines.length > 1) { while (shown && pdf.getTextWidth(shown + '...') > width) shown = shown.slice(0, -1); shown += '...' }
    pdf.text(shown, x, y)
  }
  const heading = () => {
    pdf.setFont('helvetica', 'bold'); pdf.setTextColor(22, 70, 67); pdf.setFontSize(17); pdf.text(APP_NAME, margin, 15)
    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(33, 43, 48)
    fitText(`${t(kindNames[options.kind])} / ${title}`, margin, 24, contentWidth, 12)
    fitText(`${warehouse.name} | ${formatMeasure(warehouse.widthMm)} x ${formatMeasure(warehouse.depthMm)} ${getMeasurementUnit()}`, margin, 32, contentWidth, 9)
    pdf.setFontSize(8); pdf.setTextColor(90); pdf.text(t(`Generado: ${date} (Madrid)`), margin, 39)
    pdf.setDrawColor(205, 216, 215); pdf.setLineWidth(.25); pdf.line(margin, 43, pageWidth - margin, 43)
  }
  heading()

  // Physical footprints use the same rotation semantics as the interactive plan.
  const planY = 51, planHeight = 125
  const scale = Math.min(contentWidth / warehouse.widthMm, planHeight / warehouse.depthMm)
  const planWidth = warehouse.widthMm * scale, actualHeight = warehouse.depthMm * scale
  const planX = margin + (contentWidth - planWidth) / 2
  const at = (x: number, y: number) => [planX + x * scale, planY + y * scale] as const
  pdf.setFillColor(249, 251, 250); pdf.setDrawColor(125, 143, 142); pdf.rect(planX, planY, planWidth, actualHeight, 'FD')
  for (const element of [...warehouse.zones, ...warehouse.fixtures, ...warehouse.racks]) {
    const rect = footprint(element), [x, y] = at(rect.x, rect.y), w = rect.w * scale, h = rect.d * scale
    const color = /^#[\da-f]{6}$/i.test(element.color) ? element.color : '#668888'
    const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16))
    const zone = 'kind' in element && element.kind === 'zone'
    pdf.setFillColor(...rgb.map(c => Math.round(c * (zone ? .15 : .28) + 255 * (zone ? .85 : .72))) as [number, number, number])
    pdf.setDrawColor(...rgb as [number, number, number]); pdf.setLineWidth(zone ? .15 : .35); pdf.rect(x, y, w, h, 'FD')
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(35, 55, 55)
    const label = clean(element.code)
    if (h >= 4 && w >= pdf.getTextWidth(label) + 2) pdf.text(label, x + w / 2, y + h / 2 + .8, { align: 'center' })
    if (!('kind' in element)) { const face = accessFace(element), a = at(face.start.xMm, face.start.yMm), b = at(face.end.xMm, face.end.yMm); pdf.setDrawColor(19, 92, 84); pdf.setLineWidth(.75); pdf.line(...a, ...b) }
  }
  if (route?.path.length) {
    pdf.setDrawColor(206, 92, 23); pdf.setLineWidth(.7)
    for (let i = 1; i < route.path.length; i++) { const a = at(route.path[i - 1].xMm, route.path[i - 1].yMm), b = at(route.path[i].xMm, route.path[i].yMm); pdf.line(...a, ...b) }
    for (const stop of route.stops) {
      const [x, y] = at(stop.point.xMm, stop.point.yMm)
      pdf.setDrawColor(206, 92, 23); pdf.setFillColor(255, 255, 255); pdf.circle(x, y, 2.4, 'FD'); pdf.setTextColor(160, 58, 10); pdf.setFontSize(7); pdf.text(String(stop.index), x, y + .8, { align: 'center' })
    }
    const start = at(route.path[0].xMm, route.path[0].yMm), end = at(route.path.at(-1)!.xMm, route.path.at(-1)!.yMm)
    const endpoint = (point: readonly [number, number], label: string, color: [number, number, number], dy: number) => {
      pdf.setDrawColor(...color); pdf.setFillColor(...color); pdf.circle(...point, 1.5, 'FD'); pdf.setTextColor(...color); pdf.setFontSize(7)
      const x = Math.min(pageWidth - margin - 12, Math.max(margin, point[0] + 2)), y = Math.min(182, Math.max(49, point[1] + dy)); pdf.text(label, x, y)
    }
    endpoint(start, t('Inicio'), [19, 92, 84], -3); endpoint(end, t('Fin'), [125, 55, 135], 5)
  }
  pdf.setTextColor(80); pdf.setFontSize(8)
  pdf.text(t('Plano 2D / cotas en {0} / borde verde: cara de acceso', { 0: getMeasurementUnit() }), margin, 185)
  if (route) pdf.text(`${route.stops.length} ${t("paradas")} | ${formatMeasure(route.distanceMm)} ${getMeasurementUnit()} | ${route.exact ? t('Orden óptimo en malla') : t('Orden aproximado en malla')}, ${t("celda")} ${formatMeasure(route.cellSizeMm)} ${getMeasurementUnit()}`, margin, 191)

  type Table = { headers: string[]; widths: number[]; rows: string[][] }
  const commonRow = (line: DataLine) => [line.reference, formatQuantity(line.quantity), line.location, line.description, line.origin]
  const table: Table = options.kind === 'route' && route ? {
    headers: [t('Parada'), t('Dist. ({0})', { 0: getMeasurementUnit() }), t('Referencia'), t('Cantidad'), t('Ubicación'), t('Descripción'), t('Origen')], widths: [15, 21, 35, 21, 27, 92, 62],
    rows: route.stops.flatMap(stop => stop.lines.map(line => [String(stop.index), formatMeasure(stop.distanceMm), line.reference, formatQuantity(line.quantity), line.location, line.description, line.origin])),
  } : options.kind === 'warehouse' ? {
    headers: [t('Tipo'), t('Código'), t('Nombre'), t('Posición ({0})', { 0: getMeasurementUnit() }), t('Huella ({0})', { 0: getMeasurementUnit() })], widths: [35, 26, 94, 59, 59],
    rows: [...warehouse.zones, ...warehouse.fixtures, ...warehouse.racks].map(element => { const rect = footprint(element); return ['kind' in element ? ({ zone: t('Zona'), table: t('Mesa'), obstacle: t('Obstáculo') }[element.kind]) : t('Estantería'), element.code, 'kind' in element ? element.name : element.alias, `${formatMeasure(rect.x)} / ${formatMeasure(rect.y)}`, `${formatMeasure(rect.w)} x ${formatMeasure(rect.d)}`] }),
  } : { headers: [t('Referencia'), t('Cantidad'), t('Ubicación'), t('Descripción'), t('Origen')], widths: [35, 24, 29, 113, 72], rows: options.lines.map(commonRow) }
  const lineHeight = 4, bottom = 195
  let y = 0
  const nextTablePage = () => {
    pdf.addPage(); heading(); y = 50
    pdf.setFillColor(31, 85, 80); pdf.rect(margin, y - 4, contentWidth, 8, 'F')
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(255)
    let x = margin; table.headers.forEach((header, i) => { pdf.text(header, x + 2, y + 1); x += table.widths[i] })
    y += 9; pdf.setFont('helvetica', 'normal'); pdf.setTextColor(33, 43, 48)
  }
  if (table.rows.length) {
    nextTablePage()
    table.rows.forEach((row, rowIndex) => {
      pdf.setFontSize(8)
      const cells: string[][] = row.map((cell, c) => pdf.splitTextToSize(clean(cell), table.widths[c] - 4))
      const totalLines = Math.max(1, ...cells.map(cell => cell.length)); let offset = 0
      while (offset < totalLines) {
        if (bottom - y < lineHeight + 3) nextTablePage()
        const count = Math.min(totalLines - offset, Math.floor((bottom - y - 3) / lineHeight)), height = count * lineHeight + 3
        pdf.setFillColor(rowIndex % 2 ? 245 : 255, rowIndex % 2 ? 248 : 255, rowIndex % 2 ? 247 : 255); pdf.rect(margin, y - 3, contentWidth, height, 'F')
        let x = margin
        cells.forEach((cell, c) => {
          const chunk = cell.slice(offset, offset + count)
          if (offset > 0 && c === 0 && !chunk.length) chunk.push('(cont.)')
          if (chunk.length) pdf.text(chunk, x + 2, y + .5, { lineHeightFactor: lineHeight / (8 * .352778) })
          x += table.widths[c]
        })
        y += height; offset += count
        pdf.setDrawColor(219, 227, 225); pdf.setLineWidth(.15); pdf.line(margin, y - 3, pageWidth - margin, y - 3)
      }
    })
  } else { pdf.setTextColor(80); pdf.setFontSize(8); pdf.text(t('Sin líneas para este informe.'), margin, 197) }
  const pages = pdf.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(110)
    pdf.text(t(`Página ${page} / ${pages}`), pageWidth - margin, pageHeight - 6, { align: 'right' })
  }
  return pdf
}
