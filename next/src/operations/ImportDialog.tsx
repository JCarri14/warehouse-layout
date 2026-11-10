import { t, useLanguage } from '../i18n'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { chooseHeader, formatQuantity, guessMapping, previewImport } from './imports'
import type { ColumnMapping, ImportTable } from './imports'
import type { DataLine } from './types'
import './ImportDialog.css'

type Props = { tables: ImportTable[]; fileName: string; kind: 'inventory' | 'order'; template: string; hasExisting: boolean; onImport: (lines: DataLine[], name: string, append: boolean) => void; onClose: () => void }
const fields = [['reference', 'Referencia'], ['description', 'Descripción / artículo'], ['location', 'Ubicación'], ['quantity', 'Cantidad'], ['origin', 'Origen / OT']] as const
const emptyMapping: ColumnMapping = { reference: -1, description: -1, location: -1, quantity: -1, origin: -1, defaultQuantityOne: false }

export function ImportDialog({ tables, fileName, kind, template, hasExisting, onImport, onClose }: Props) {
  const language = useLanguage()
  const id = useId(), panel = useRef<HTMLDivElement>(null)
  const [sheet, setSheet] = useState(0), [header, setHeader] = useState<number | null>(null), [mapping, setMapping] = useState(() => tables[0] ? guessMapping(tables[0]) : emptyMapping)
  const [name, setName] = useState(() => fileName.replace(/\.[^.]+$/, '').slice(0, 200)), [append, setAppend] = useState(kind === 'order' && hasExisting)
  const table = useMemo(() => header === null ? tables[sheet] : chooseHeader(tables[sheet], header), [tables, sheet, header])
  const preview = useMemo(() => {
    // Validation messages are generated in the selected language.
    void language
    if (!table) return { lines: [], errors: [], omitted: [], message: t('El archivo no contiene una tabla con datos.') }
    try {
      const result = previewImport(table, mapping, template, name.trim())
      if (kind === 'order') for (const line of result.lines) if (line.quantity <= 0) result.errors.push({ row: Number(line.id.split('-')[2]), message: t('La cantidad de una OT debe ser mayor que cero.') })
      if (kind === 'order') for (const line of result.lines) if ([line.reference, line.description, line.origin].some(text => text.length > 4096)) result.errors.push({ row: Number(line.id.split('-')[2]), message: t('Los campos de texto de la OT admiten hasta 4.096 caracteres.') })
      return { ...result, lines: kind === 'order' ? result.lines.filter(line => line.quantity > 0) : result.lines, message: '' }
    } catch (error) { return { lines: [], errors: [], omitted: [], message: error instanceof Error ? error.message : t('Revisa las columnas seleccionadas.') } }
  }, [table, mapping, template, name, kind, language])
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const originalOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'
    const focusable = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])
    focusable()[0]?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
      if (event.key !== 'Tab') return
      const controls = focusable(), first = controls[0], last = controls.at(-1)
      if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus() }
    }
    const keepFocus = (event: FocusEvent) => { if (!panel.current?.contains(event.target as Node)) focusable()[0]?.focus() }
    document.addEventListener('keydown', keydown, true); document.addEventListener('focusin', keepFocus)
    return () => { document.removeEventListener('keydown', keydown, true); document.removeEventListener('focusin', keepFocus); document.body.style.overflow = originalOverflow; previous?.focus() }
  }, [onClose])
  const invalid = !!preview.message || !!preview.errors.length || !preview.lines.length || !name.trim() || name.trim().length > 200
  const action = kind === 'inventory' ? t('Importar inventario') : t('Importar OT')
  const semantics = kind === 'inventory' ? t('Este inventario sustituirá al inventario actual.') : append && hasExisting ? t('Estas líneas se añadirán a la OT actual.') : t('Estas líneas sustituirán a la OT actual.')
  return <div className="opi-backdrop"><div ref={panel} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-intro`} className="opi-dialog">
    <header className="opi-heading"><div><p className="opi-eyebrow">{t("REVISAR IMPORTACIÓN")}</p><h2 id={`${id}-title`}>{kind === 'inventory' ? t('Importar inventario') : t('Importar orden de trabajo')}</h2><p id={`${id}-intro`}>{t("Asigna las columnas y revisa el resultado antes de importar.")}</p></div><button type="button" onClick={onClose} aria-label={t("Cerrar importación")}>{t("Cerrar")}</button></header>
    <div className="opi-content">
      <section className="opi-setup" aria-label={t("Origen y columnas")}><div className="opi-source"><span className="opi-file" title={fileName}>{fileName}</span><label>{t("Hoja")}<select value={sheet} onChange={event => { const next = Number(event.target.value); setSheet(next); setHeader(null); setMapping(tables[next] ? guessMapping(tables[next]) : emptyMapping) }}>{tables.map((item, i) => <option value={i} key={i}>{item.name || t(`Hoja ${i + 1}`)}</option>)}</select></label><label>{t("Nombre")}{" "}{kind === 'order' ? t('de la OT') : t('del inventario')}<input value={name} maxLength={200} onChange={event => setName(event.target.value)} /></label></div>
        {table?.rawRecords && <label className="opi-header-row">{t("Fila de cabecera")}<select aria-label={t("Fila de cabecera")} value={table.headerIndex ?? 0} onChange={event => { const next = Number(event.target.value), selected = chooseHeader(tables[sheet], next); setHeader(next); setMapping(guessMapping(selected)) }}>{table.rawRecords.slice(0, 100).map((row, index) => <option key={index} value={index} disabled={!row.some(cell => cell.trim())}>{t("Fila")}{" "}{table.rawSourceRows?.[index] ?? index + 1}: {row.filter(Boolean).join(' · ').slice(0, 140) || t('(vacía)')}</option>)}</select></label>}
        <h3>{t("Columnas del archivo")}</h3><p className="opi-help">{t("Necesitas ubicación y referencia o descripción. Cada campo debe usar una columna diferente.")}</p><div className="opi-mappings">{fields.map(([field, label]) => <label key={field}>{t(label)}<select value={mapping[field]} onChange={event => setMapping(current => ({ ...current, [field]: Number(event.target.value) }))}><option value={-1}>{t("Sin asignar")}</option>{table?.headers.map((header, i) => <option key={i} value={i}>{i + 1}. {header || t(`Columna ${i + 1}`)}</option>)}</select></label>)}</div>
        <label className="opi-check"><input type="checkbox" checked={mapping.defaultQuantityOne} onChange={event => setMapping(current => ({ ...current, defaultQuantityOne: event.target.checked }))} />{t("Usar cantidad 1 por fila cuando no se asigne una columna de cantidad")}</label>
        {kind === 'order' && hasExisting && <fieldset className="opi-destination"><legend>{t("La OT ya contiene líneas")}</legend><label><input type="radio" name={`${id}-destination`} checked={append} onChange={() => setAppend(true)} />{" "}{t("Añadir a la OT actual")}</label><label><input type="radio" name={`${id}-destination`} checked={!append} onChange={() => setAppend(false)} />{" "}{t("Sustituir la OT actual")}</label></fieldset>}
      </section>
      <section className="opi-review" aria-label={t("Vista previa de importación")}><div className="opi-summary" aria-live="polite"><strong>{preview.lines.length}{" "}{t("líneas para importar")}</strong><span>{preview.omitted.length}{" "}{t("omitidas sin ubicación")}</span><span>{preview.errors.length}{" "}{t("errores")}</span></div>
        {preview.message && <p role="alert" className="opi-error">{t(preview.message)}</p>}
        {!!preview.errors.length && <div role="alert" className="opi-error"><strong>{t("Corrige los errores antes de importar.")}</strong><ul>{preview.errors.slice(0, 10).map((error, i) => <li key={i}>{t("Fila")}{" "}{error.row}: {t(error.message)}</li>)}</ul>{preview.errors.length > 10 && <p>{t("Y {0} errores más.", { 0: preview.errors.length - 10 })}</p>}</div>}
        {!!preview.omitted.length && <p className="opi-help">{t("Se omiten las filas sin ubicación, con «-» o con un marcador entre paréntesis. Filas:")}{" "}{preview.omitted.slice(0, 10).map(row => row.row).join(', ')}{preview.omitted.length > 10 ? '…' : ''}.</p>}
        {!!preview.lines.length && <><h3>{t("Primeras")}{" "}{Math.min(8, preview.lines.length)}{" "}{t("líneas válidas")}</h3><div className="opi-table-wrap"><table><thead><tr><th>{t("Fila")}</th><th>{t("Referencia")}</th><th>{t("Descripción")}</th><th>{t("Ubicación")}</th><th>{t("Cantidad")}</th><th>{t("Origen")}</th></tr></thead><tbody>{preview.lines.filter(line => kind !== 'order' || line.quantity > 0).slice(0, 8).map(line => <tr key={line.id}><td>{line.id.split('-')[2]}</td><td>{line.reference || '—'}</td><td>{line.description || '—'}</td><td>{line.location}</td><td>{formatQuantity(line.quantity)}</td><td>{line.origin || '—'}</td></tr>)}</tbody></table></div></>}
      </section>
    </div>
    <footer className="opi-footer"><div><strong>{semantics}</strong><p>{t("Los cambios se aplican al pulsar «")}{action}{t("».")}</p></div><div className="opi-actions"><button type="button" onClick={onClose}>{t("Cancelar")}</button><button className="primary" type="button" disabled={invalid} onClick={() => { if (!invalid) onImport(preview.lines, name.trim(), kind === 'order' && hasExisting && append) }}>{action}</button></div></footer>
  </div></div>
}
