import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Both theme token files load at boot; the active one is selected by the
// `data-theme` attribute set on the html element (see theme/themes.ts).
import './theme/magic-forest/tokens.css'
import './theme/starry-universe/tokens.css'
import { App } from './App'
import { registerServiceWorker } from './pwa/registerServiceWorker'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA — registers the Workbox-generated service worker after the
// initial paint so the install step doesn't fight with the first
// render. Silent: autoUpdate flips the SW on next navigation.
void registerServiceWorker()
