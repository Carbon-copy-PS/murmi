const THEME_KEY = 'ds_theme'

export function getStoredTheme() {
  return localStorage.getItem(THEME_KEY)
}

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveTheme() {
  return getStoredTheme() || systemTheme()
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

export function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme)
  applyTheme(theme)
  return theme
}

export function initTheme() {
  applyTheme(resolveTheme())
}

export function toggleTheme() {
  const next = resolveTheme() === 'dark' ? 'light' : 'dark'
  return setTheme(next)
}
