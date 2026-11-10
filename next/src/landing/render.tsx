import { renderToString } from 'react-dom/server'
import LandingPage from './LandingPage'
import { setLanguage } from '../i18n'
export function renderLanding(language: 'es' | 'en') {
 setLanguage(language)
 return renderToString(<LandingPage />)
}
