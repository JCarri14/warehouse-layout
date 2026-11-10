import { useEffect, useState, type ComponentType } from 'react'

/** Decorative 3D yields to the usable home screen; mobile never loads a hidden canvas. */
export function DeferredStartRack() {
  const [Rack, setRack] = useState<ComponentType | null>(null)
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 801px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 801px)'), change = () => setWide(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    if (!wide) return
    let active = true, idle: number | undefined
    const load = () => { void import('./StartRack').then(module => { if (active) setRack(() => module.StartRack) }).catch(() => { /* Decoration must never block opening a warehouse. */ }) }
    // Give the initial layout and controls a frame before requesting the optional engine.
    const timer = window.setTimeout(() => {
      if ('requestIdleCallback' in window) idle = window.requestIdleCallback(load, { timeout: 1500 })
      else load()
    }, 250)
    return () => { active = false; clearTimeout(timer); if (idle !== undefined) window.cancelIdleCallback(idle) }
  }, [wide])
  return <div className="start-rack-slot" aria-hidden="true">{wide && Rack && <Rack/>}</div>
}
