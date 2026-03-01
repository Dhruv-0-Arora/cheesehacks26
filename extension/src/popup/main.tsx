import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ApiProvider } from '../context.tsx'
import { extensionApi } from '../api.ts'
import App from './App.tsx'
import './popup.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApiProvider api={extensionApi}>
      <App />
    </ApiProvider>
  </StrictMode>,
)
