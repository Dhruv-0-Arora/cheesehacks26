import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import HeroDemo from './components/HeroDemo'
import './index.css'

const demoEl = document.getElementById('hero-demo')
if (demoEl) {
  createRoot(demoEl).render(
    <StrictMode>
      <HeroDemo />
    </StrictMode>,
  )
}
