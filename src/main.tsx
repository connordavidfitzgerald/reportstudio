import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthGate } from './auth/AuthGate.tsx'
import { initUi } from './store/useUi.ts'

// Before the first render, so the chrome never flashes the default theme.
initUi()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Keyed on the account: see the note in AuthGate. */}
    <AuthGate>{(userId) => <App key={userId} />}</AuthGate>
  </StrictMode>,
)
