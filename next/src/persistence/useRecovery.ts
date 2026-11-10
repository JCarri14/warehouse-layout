import { t } from '../i18n'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { hasRecoverableWork, loadRecovery } from './recovery'
import { createRecoveryPersistence, hasExternalInventory } from './recoveryPersistence'
import { recoveryInventories } from './recoveryInventories'
import type { PendingEdit, WorkspaceSnapshot } from '../operations/types'

export function useRecovery(session: WorkspaceSnapshot, getPending: () => PendingEdit | undefined) {
  const [persistence] = useState(() => createRecoveryPersistence({ getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value), removeItem: key => window.localStorage.removeItem(key) }, recoveryInventories))
  const [loading, setLoading] = useState(() => hasExternalInventory({ getItem: key => window.localStorage.getItem(key) }))
  const [initial, setInitial] = useState(() => { try { return loading ? { ok: true as const, envelope: null } : loadRecovery(window.localStorage) } catch { return { ok: false as const, message: t('El almacenamiento local no está disponible.') } } })
  const [pending, setPending] = useState(loading || (initial.ok ? !!initial.envelope : true))
  const [status, setStatus] = useState({ savedAt: '', error: '' })
  const latest = useRef({ session, getPending }), gate = useRef(!pending), written = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const saving = useRef(false), queued = useRef(false)
  useLayoutEffect(() => { latest.current = { session, getPending } })
  const persist = useCallback(async function persist() {
    if (!gate.current) return
    if (saving.current) { queued.current = true; return }
    const current = latest.current, edit = current.getPending()
    if (!written.current && !hasRecoverableWork(current.session, edit)) return
    const data = { ...current.session, pendingEdit: edit }
    saving.current = true
    const result = await persistence.save(data)
    saving.current = false
    if (result.ok) { written.current = true; setStatus({ savedAt: result.savedAt, error: '' }) }
    else setStatus({ savedAt: '', error: result.message })
    if (queued.current) { queued.current = false; void persist() }
  }, [persistence])
  useEffect(() => {
    if (!loading) return
    let active = true
    void persistence.load().then(result => {
      if (!active) return
      setInitial(result); setPending(result.ok ? !!result.envelope : true); gate.current = result.ok && !result.envelope; setLoading(false)
    })
    return () => { active = false }
  }, [loading, persistence])
  const schedule = useCallback(() => { clearTimeout(timer.current); if (gate.current) timer.current = setTimeout(persist, 600) }, [persist])
  useEffect(() => { schedule() }, [session, schedule])
  useEffect(() => {
    const flush = () => { clearTimeout(timer.current); persist() }
    const hide = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush); document.addEventListener('visibilitychange', hide)
    return () => { clearTimeout(timer.current); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hide) }
  }, [persist])
  const accept = () => { gate.current = true; written.current = true; setPending(false); schedule() }
  const discard = () => {
    try { persistence.discard() } catch { setStatus({ savedAt: '', error: t('No se puede borrar la copia local en este navegador.') }) }
    gate.current = true; written.current = false; setPending(false); schedule()
  }
  return { pending, loading, envelope: initial.ok ? initial.envelope : null, initialError: initial.ok ? '' : initial.message, status, schedule, accept, discard }
}
