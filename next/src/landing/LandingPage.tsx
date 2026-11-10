
import { APP_ICON, APP_NAME } from '../brand'
import { setLanguage, t, useLanguage } from '../i18n'
import './LandingPage.css'

export default function LandingPage() {
  const language = useLanguage()
  const baseUrl = import.meta.env.BASE_URL
  const appUrl = `${baseUrl}app`
  return <div className="landing-page">
    <header className="landing-header">
      <a className="landing-brand" href={baseUrl}><img src={APP_ICON} width="40" height="40" alt=""/>{APP_NAME}</a>
      <nav aria-label={t('Navegación de presentación')}>
        <label className="landing-language"><span>{t('Idioma')}</span><select value={language} onChange={event => { setLanguage(event.target.value as 'es' | 'en'); window.location.assign(event.target.value === 'en' ? '/en/' : '/') }}><option value="es">Español</option><option value="en">English</option></select></label>
        <a className="landing-button" href={appUrl}>{t('Abrir aplicación')} <span aria-hidden="true">↗</span></a>
      </nav>
    </header>
    <main>
      <section className="landing-hero">
        <div className="landing-pitch"><span className="eyebrow">{t('Planificación visual de almacenes')}</span>
          <h1>{t('Diseña tu almacén en 3D.')}</h1>
          <p>{t('Diseña tu almacén, encuentra el inventario y prepara recorridos sobre un mismo plano.')}</p>
          <a className="landing-button landing-primary" href={appUrl}>{t('Empezar con mi almacén')} <span aria-hidden="true">→</span></a>
          <small>{t('En tu navegador. Con tus archivos locales.')}</small>
        </div>
        <figure className="landing-preview"><div className="landing-preview-label"><span>{APP_NAME}</span><span>{t('Vista del editor')}</span></div><img src={`${baseUrl}landing/editor${language === 'en' ? '-en' : ''}.png`} width="1440" height="900" alt={t('Editor de Warehouse Layout con un almacén en vista isométrica y paneles de diseño')}/><figcaption>{t('Un ejemplo real, abierto en la aplicación.')}</figcaption></figure>
      </section>
      <section className="landing-capabilities" aria-labelledby="capabilities-heading">
        <div className="landing-section-heading"><span className="eyebrow">{t('Del espacio al recorrido')}</span><h2 id="capabilities-heading">{t('Entiende el almacén antes de mover nada.')}</h2></div>
        <ol>{[
          ['Diseña el espacio', 'Distribuye estanterías, zonas y obstáculos. Ajusta sus dimensiones en planta y comprueba el conjunto en 3D.'],
          ['Localiza el inventario', 'Importa tus datos y relaciona referencias y ubicaciones con las estanterías del plano.'],
          ['Prepara los recorridos', 'Organiza órdenes de trabajo, calcula recorridos y exporta informes para revisar el resultado.'],
        ].map(([title, description], index) => <li key={title}><span className="landing-step">0{index + 1}</span><div><h3>{t(title)}</h3><p>{t(description)}</p></div></li>)}</ol>
      </section>
      <section className="landing-local"><div><span className="eyebrow">{t('Tu espacio de trabajo')}</span><h2>{t('Abre, prueba y vuelve cuando quieras.')}</h2><p>{t('Empieza con el almacén de ejemplo o abre uno propio. Tus recientes quedan en este navegador; guarda un archivo para conservar y compartir tu trabajo.')}</p></div><a className="landing-button landing-primary" href={appUrl}>{t('Abrir aplicación')} <span aria-hidden="true">→</span></a></section>
    </main>
    <footer className="landing-footer"><nav aria-label="Languages"><a href="/" hrefLang="es">Español</a> · <a href="/en/" hrefLang="en">English</a></nav><strong>{APP_NAME}</strong><span>Visual Warehouse Planning</span></footer>
  </div>
}






