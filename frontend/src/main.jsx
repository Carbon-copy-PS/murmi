import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import PublicResults from './components/public-results'
import './index.css'
import './i18n'
import { initTheme } from './theme'

initTheme()

const publicMatch = window.location.pathname.match(/^\/r\/([^/]+)\/?$/)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {publicMatch ? <PublicResults publicId={decodeURIComponent(publicMatch[1])} /> : <App />}
  </React.StrictMode>
)
