import React from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/app/App'
import '@/styles/tokens.css'
import '@/styles/glass.css'
import '@/styles/v5.css'
import 'katex/dist/katex.min.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
