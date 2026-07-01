import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveTheme, toggleTheme } from '../theme'

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  )
}

export default function ThemeToggle() {
  const { t } = useTranslation()
  const [theme, setThemeState] = useState(resolveTheme)

  function handleToggle() {
    setThemeState(toggleTheme())
  }

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={handleToggle}
      title={isDark ? t('theme.toLight') : t('theme.toDark')}
      aria-label={isDark ? t('theme.toLight') : t('theme.toDark')}
      data-testid="theme-toggle"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
