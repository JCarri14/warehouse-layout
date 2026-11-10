import { t, useLanguage } from '../i18n'
import { useEffect, useRef, useState, type ReactNode } from 'react'

export function FileMenu({ children }: { children: ReactNode }) {
  useLanguage()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
    }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key) }
  }, [open])
  return <div ref={root} className="file-menu" onKeyDown={event => {
    event.stopPropagation()
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() }
  }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false) }}>
    <button ref={trigger} aria-expanded={open} aria-controls="warehouse-files" onClick={() => setOpen(!open)}>{t("Archivo del almacén")}{" "}<span aria-hidden="true">⌄</span></button>
    <div id="warehouse-files" hidden={!open} onClick={event => { if ((event.target as HTMLElement).closest('button')) { setOpen(false); trigger.current?.focus() } }}>{children}</div>
  </div>
}
