import { t } from '../i18n'
export type PropertyTab = 'general' | 'locations' | 'levels'
export function PropertyTabs({ value, onChange, rack }: { value: PropertyTab; onChange: (tab: PropertyTab) => void; rack: boolean }) {
  const tabs: [PropertyTab, string][] = [['general', 'General'], ['locations', 'Ubicaciones'], ...(rack ? [['levels', 'Niveles'] as [PropertyTab, string]] : [])]
  return <div className="property-tabs" role="tablist" aria-label={t('Propiedades')}>
    {tabs.map(([id, label], index) => <button key={id} type="button" role="tab" id={`property-tab-${id}`} aria-controls={`property-page-${id}`} aria-selected={value === id} tabIndex={value === id ? 0 : -1} onClick={() => onChange(id)} onKeyDown={event => {
      const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
      if (next < 0) return
      event.preventDefault(); onChange(tabs[next][0]); document.getElementById(`property-tab-${tabs[next][0]}`)?.focus()
    }}>{t(label)}</button>)}
  </div>
}
