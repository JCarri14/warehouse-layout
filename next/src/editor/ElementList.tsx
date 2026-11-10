import { useMemo, useState } from 'react'
import { t, useLanguage } from '../i18n'
import { formatMeasure, useMeasurementUnit } from '../measurements'
import { allElements, elementKind, elementName, type ElementKind, type WarehouseDocument } from '../warehouse/document'
import { Icon } from './Icon'
import './ElementList.css'

const types = [['rack', 'Estanterías'], ['zone', 'Zonas'], ['obstacle', 'Obstáculos'], ['table', 'Mesas']] as const
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()

export function ElementList({ document, selected, onSelect }: { document: WarehouseDocument; selected: string | null; onSelect: (id: string) => void }) {
  useLanguage()
  const unit = useMeasurementUnit()
  const [kind, setKind] = useState<ElementKind | ''>(''), [query, setQuery] = useState('')
  const elements = useMemo(() => allElements(document), [document])
  const indexed = useMemo(() => elements.map(element => ({ element, text: normalize(`${element.code} ${elementName(element)}`) })), [elements])
  const counts = useMemo(() => elements.reduce((result, element) => { result[elementKind(element)]++; return result }, { rack: 0, zone: 0, obstacle: 0, table: 0 }), [elements])
  const search = normalize(query)
  const visible = indexed.filter(({ element, text }) => (!kind || elementKind(element) === kind) && (!search || text.includes(search)))
  const hiddenSelection = selected && elements.some(element => element.id === selected) && !visible.some(({ element }) => element.id === selected)
  const filtered = !!kind || !!query
  const reset = () => { setKind(''); setQuery('') }
  return <>
    <div className="element-filters">
      <label>{t('Mostrar elementos')}<select aria-label={t('Mostrar elementos')} value={kind} onChange={event => setKind(event.target.value as ElementKind | '')}><option value="">{t('Todos')} ({elements.length})</option>{types.map(([value, label]) => <option key={value} value={value}>{t(label)} ({counts[value]})</option>)}</select></label>
      <label>{t('Buscar elementos')}<input type="search" value={query} placeholder={t('Código o nombre')} onChange={event => setQuery(event.target.value)}/></label>
      <div className="element-filter-summary"><span role="status">{t('{0} de {1} elementos', { 0: visible.length, 1: elements.length })}</span>{filtered && <button className="text-button" onClick={reset}>{t('Mostrar todos')}</button>}</div>
      {hiddenSelection && <p className="element-filter-notice">{t('La selección está fuera del filtro.')}</p>}
    </div>
    <div className="element-list">{visible.map(({ element: e }) => <button key={e.id} data-kind={elementKind(e)} className={`element-row ${selected === e.id ? 'active' : ''}`} onClick={() => onSelect(e.id)}><span className="rack-swatch" style={{ background: e.color }}/><span><strong>{e.code}</strong><small>{elementName(e) || `${formatMeasure(e.widthMm)} × ${formatMeasure(e.depthMm)} ${unit}`}</small></span><Icon name={elementKind(e)} size={15}/></button>)}
      {!visible.length && <p className="list-empty">{t(elements.length ? 'No hay elementos que coincidan con los filtros.' : 'Aquí aparecerán los elementos que añadas al plano.')}</p>}
    </div>
  </>
}

