import { t, useLanguage, locale } from '../i18n'
import { useEffect, useRef } from 'react'
import type { RecoveryEnvelope } from './recovery'
export function RecoveryPrompt({ envelope, error, recover, discard }: { envelope: RecoveryEnvelope | null; error: string; recover: () => void; discard: () => void }) {
  useLanguage()
  const dialogRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const element = dialogRef.current!, previous = document.activeElement as HTMLElement | null
    const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>('button')); buttons[0]?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === buttons[0]) { e.preventDefault(); buttons.at(-1)?.focus() }
        else if (!e.shiftKey && document.activeElement === buttons.at(-1)) { e.preventDefault(); buttons[0]?.focus() }
      }
    }
    element.addEventListener('keydown', key); return () => { element.removeEventListener('keydown', key); previous?.focus() }
  }, [])
  return <div className="modal-shade"><section ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby="recovery-title"><h2 id="recovery-title">{envelope ? t('Hay una sesión para recuperar') : t('No se pudo leer la copia local')}</h2><p>{envelope ? t(`Copia de ${new Date(envelope.savedAt).toLocaleString(locale(), { timeZone: 'Europe/Madrid' })}. Incluye el almacén, inventario, OT y propiedades pendientes. No sustituye tus archivos descargados.`) : t(error)}</p><div className="dialog-actions"><button onClick={discard}>{envelope ? t('Descartar copia') : t('Continuar sin esta copia')}</button>{envelope && <button className="primary" onClick={recover}>{t("Recuperar sesión")}</button>}</div></section></div>
}
