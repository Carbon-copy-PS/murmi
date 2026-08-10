import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import PublicResults from './components/public-results'
import LegalPage from './components/legal/LegalPage'
import './index.css'
import './i18n'
import { initTheme } from './theme'

initTheme()

const path = window.location.pathname.replace(/\/+$/, '') || '/'
const publicMatch = path.match(/^\/r\/([^/]+)$/)
const legalDoc = path === '/privacy' ? 'privacy' : path === '/terms' ? 'terms' : null

function Root() {
  if (publicMatch) {
    return <PublicResults publicId={decodeURIComponent(publicMatch[1])} />
  }
  if (legalDoc) {
    return <LegalPage doc={legalDoc} />
  }
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
