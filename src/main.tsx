// Design-system CSS first: tokens, then the shared self-hosted fonts, then the
// app's own styles (which only use var(--c-*) references). See src/vendor/ui/README.md.
import './vendor/ui/tokens.css'
import './vendor/ui/fonts.css'
import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
