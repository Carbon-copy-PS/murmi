const THEME_KEY = 'ds_theme'
const DEFAULT_THEME = 'light'

export function getStoredTheme() {
  return localStorage.getItem(THEME_KEY)
}

export function resolveTheme() {
  return getStoredTheme() || DEFAULT_THEME
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
