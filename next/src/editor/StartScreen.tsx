import { WarehouseThumbnail } from './WarehouseThumbnail'
import { APP_NAME } from '../brand'
import { useEffect, useMemo, useState } from 'react'
import { locale, t } from '../i18n'
import { type WarehouseDocument } from '../warehouse/document'
import { decode } from '../persistence/documentCodec'
import { forgetWarehouse, listRecentWarehouses, type RecentWarehouse } from '../persistence/recentWarehouses'
import { Icon } from './Icon'
import './StartScreen.css'

function Thumbnail({ entry }: { entry: RecentWarehouse }) {
  const doc = useMemo(() => { try { return decode(entry.source) } catch { return null } }, [entry.source])
  if (!doc) return <Icon name="grid" size={36}/>
  return <WarehouseThumbnail document={doc}/>
}
export function StartScreen({ onNew, onOpen, onExample, onContinue, onRecent, revision, error, document: currentDocument, dirty, hasSession }: {
  onNew: () => void; onOpen: () => void; onExample: () => void; onContinue: () => void; onRecent: (entry: RecentWarehouse, copy?: boolean) => void
  revision: number; error: string; document: WarehouseDocument; dirty: boolean; hasSession: boolean
}) {
  const [entries, setEntries] = useState<RecentWarehouse[]>([]), [storageError, setStorageError] = useState(''), [loading, setLoading] = useState(true)
  const latest = !hasSession && !dirty ? entries[0] : undefined
  const latestDocument = useMemo(() => { try { return latest ? decode(latest.source) : null } catch { return null } }, [latest])
  useEffect(() => { let active = true; listRecentWarehouses().then(entries => { if (active) { setEntries(entries); setLoading(false) } }).catch(() => { if (active) { setStorageError(t('No se pueden leer los recientes en este navegador. Puedes abrir un archivo.')); setLoading(false) } }); return () => { active = false } }, [revision])
  return <main className="start-screen">
    <section className="start-intro"><span className="eyebrow">{APP_NAME.toUpperCase()}</span><h1>{t('Tus almacenes')}</h1><p>{t('Retoma tu trabajo o prepara un nuevo espacio.')}</p>
      <div className="start-current"><span className="eyebrow">{t(latestDocument ? 'Último almacén' : 'Plano actual')}</span><WarehouseThumbnail document={latestDocument ?? currentDocument}/><strong>{latestDocument?.name ?? currentDocument.name}</strong><small>{dirty ? t('Cambios sin guardar') : t('Listo para continuar')}</small><button className="primary start-continue" onClick={() => latest && latestDocument ? onRecent(latest) : onContinue()}>{t(latestDocument ? 'Continuar con este almacén' : 'Seguir con el plano actual')}<Icon name="arrow" size={14}/></button></div>
      <div className="start-actions"><button onClick={onNew}><Icon name="plus"/>{t('Nuevo almacén')}</button><button onClick={onOpen}><Icon name="folder"/>{t('Abrir almacén…')}</button><button className="text-button" onClick={onExample}>{t('Abrir ejemplo detallado')}<Icon name="arrow" size={14}/></button></div>
      <a className="start-about" href={import.meta.env.BASE_URL} target="_blank" rel="noopener noreferrer">{t('Conoce Warehouse Layout')} <span aria-hidden="true">↗</span><span className="start-link-note">{t('Se abre en otra pestaña')}</span></a>
    </section>
    <section className="start-recents" aria-label={t('Almacenes recientes')}><div className="start-recents-heading"><h2>{t('Recientes')}</h2><span>{t('En este dispositivo')}</span></div>
      <p className="start-storage-note">{t('Las copias locales permiten retomar el trabajo. Guarda tus cambios en un archivo para conservarlos fuera del navegador.')}</p>
      {(error || storageError) && <p className="form-error" role="alert">{t(error || storageError)}</p>}
      {loading ? <p role="status">{t('Cargando recientes…')}</p> : !entries.length ? <div className="start-empty"><Icon name="folder" size={28}/><h3>{t('Tu próximo almacén empieza aquí')}</h3><p>{t('Abre o guarda un almacén y aparecerá en esta lista.')}</p><button onClick={onExample}>{t('Explorar un ejemplo')}<Icon name="arrow" size={14}/></button></div> : <ul className="recent-list">{entries.map(entry => <li key={entry.id}><button className="recent-open" aria-label={t('Abrir reciente: {0}', { 0: entry.name })} onClick={() => onRecent(entry)}><Thumbnail entry={entry}/><span><strong>{entry.name}</strong>{entry.filename && entry.filename !== entry.name && <small>{entry.filename}</small>}<small>{entry.handle ? t('Archivo local') : t('Copia local')} · {new Date(entry.updatedAt).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })}</small></span><Icon name="arrow" size={16}/></button><div className="recent-options">{entry.handle && <button className="text-button" onClick={() => onRecent(entry, true)}>{t('Abrir copia local')}</button>}<button className="icon-button" aria-label={t('Quitar reciente: {0}', { 0: entry.name })} title={t('Quitar de recientes; el archivo se conserva')} onClick={() => { void forgetWarehouse(entry.id).then(() => setEntries(entries => entries.filter(item => item.id !== entry.id))).catch(() => setStorageError(t('No se ha podido quitar el reciente.'))) }}><Icon name="close" size={14}/></button></div></li>)}</ul>}
    </section>
  </main>
}


