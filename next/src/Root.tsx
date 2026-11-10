import { lazy, Suspense } from 'react'
import LandingPage from './landing/LandingPage'
const App = lazy(() => import('./App'))
export default function Root() {
 const path = window.location.pathname.replace(/\/$/, '')
 if(path === '/app') return <Suspense><App /></Suspense>
 if(path === '' || path === '/en') return <LandingPage />
 return <main><h1>404</h1><a href="/">Warehouse Layout</a></main>
}
