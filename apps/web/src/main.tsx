import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Both theme token files load at boot; the active one is selected by the
// `data-theme` attribute set on the html element (see theme/themes.ts).
import './theme/magic-forest/tokens.css'
import './theme/starry-universe/tokens.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
