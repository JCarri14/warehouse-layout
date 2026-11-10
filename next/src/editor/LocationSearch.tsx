import { t, useLanguage } from '../i18n'
import { useState } from 'react'
import { Icon } from './Icon'
export function LocationSearch({ onLocate }: { onLocate: (code: string) => boolean }) {
  useLanguage()
  const [code, setCode] = useState(''), [invalid, setInvalid] = useState(false)
  return <form className="location-search" aria-label={t("Buscar una ubicación")} onSubmit={e => { e.preventDefault(); setInvalid(!onLocate(code)) }}>
    <input aria-label={t("Código de ubicación")} placeholder={t("Código de ubicación")} value={code} onChange={e => { setCode(e.target.value); setInvalid(false) }} maxLength={256} aria-invalid={invalid} spellCheck={false}/>
    <button type="submit" aria-label={t("Localizar")} title={t("Localizar una ubicación en el plano")}><Icon name="locate" size={16}/></button>
  </form>
}
