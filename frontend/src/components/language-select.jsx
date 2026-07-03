import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { filterLanguages, getLanguage, DEFAULT_LANGUAGE } from '../constants/languages'

const PANEL_MIN_WIDTH = 280
const PANEL_MAX_HEIGHT = 280
const PANEL_GAP = 6

function computePanelStyle(trigger) {
  const rect = trigger.getBoundingClientRect()
  const width = Math.max(rect.width, PANEL_MIN_WIDTH)
  const maxLeft = window.innerWidth - width - 8
  const left = Math.max(8, Math.min(rect.left, maxLeft))
  const spaceBelow = window.innerHeight - rect.bottom - PANEL_GAP
  const spaceAbove = rect.top - PANEL_GAP
  const openUp = spaceBelow < 180 && spaceAbove > spaceBelow

  if (openUp) {
    return {
      position: 'fixed',
      left,
      width,
      bottom: window.innerHeight - rect.top + PANEL_GAP,
      maxHeight: Math.min(PANEL_MAX_HEIGHT, spaceAbove),
      zIndex: 1200,
    }
  }

  return {
    position: 'fixed',
    left,
    width,
    top: rect.bottom + PANEL_GAP,
    maxHeight: Math.min(PANEL_MAX_HEIGHT, spaceBelow),
    zIndex: 1200,
  }
}

export default function LanguageSelect({
  value,
  onChange,
  'data-testid': testId,
  invalid = false,
  compact = false,
  inline = false,
  singleLine = false,
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [panelStyle, setPanelStyle] = useState(null)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const searchRef = useRef(null)
  const listId = useId()
  const searchId = useId()
  const { t } = useTranslation()
  const selected = getLanguage(value) || getLanguage(DEFAULT_LANGUAGE)
  const filtered = useMemo(() => filterLanguages(query), [query])

  const updatePanelPosition = useCallback(() => {
    if (!triggerRef.current) return
    setPanelStyle(computePanelStyle(triggerRef.current))
  }, [])

  useEffect(() => {
    function onDocClick(event) {
      const target = event.target
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
      setQuery('')
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      setPanelStyle(null)
      setQuery('')
      return undefined
    }

    updatePanelPosition()
    requestAnimationFrame(() => searchRef.current?.focus())

    function onLayout() {
      updatePanelPosition()
    }

    window.addEventListener('resize', onLayout)
    window.addEventListener('scroll', onLayout, true)
    return () => {
      window.removeEventListener('resize', onLayout)
      window.removeEventListener('scroll', onLayout, true)
    }
  }, [open, updatePanelPosition])

  function close() {
    setOpen(false)
    setQuery('')
  }

  function select(code) {
    onChange(code)
    close()
  }

  const panel = open && panelStyle ? (
    <div
      ref={panelRef}
      className="lang-select-panel lang-select-panel-portal"
      style={panelStyle}
      data-testid={testId ? `${testId}-menu` : undefined}
    >
      <div className="lang-select-search-wrap">
        <input
          ref={searchRef}
          id={searchId}
          type="search"
          className="lang-select-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('language.searchPlaceholder')}
          autoComplete="off"
          aria-controls={listId}
          data-testid={testId ? `${testId}-search` : undefined}
        />
      </div>
      <ul className="lang-select-menu" id={listId} role="listbox">
        {filtered.length === 0 ? (
          <li className="lang-select-empty" data-testid={testId ? `${testId}-empty` : undefined}>
            {t('language.noMatch', { query })}
          </li>
        ) : filtered.map((lang) => (
          <li key={lang.code} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={value === lang.code}
              className={`lang-select-option${value === lang.code ? ' selected' : ''}`}
              onClick={() => select(lang.code)}
              data-testid={testId ? `${testId}-option-${lang.code}` : undefined}
            >
              <span className="lang-select-flag" aria-hidden="true">{lang.flag}</span>
              <span className="lang-select-text">
                <span className="lang-select-native">{lang.native}</span>
                <span className="lang-select-label">{lang.label}</span>
              </span>
              {value === lang.code && <span className="lang-select-check" aria-hidden="true">✓</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  ) : null

  return (
    <div
      className={`lang-select${compact ? ' compact' : ''}${inline ? ' inline' : ''}${singleLine ? ' single-line' : ''}${open ? ' open' : ''}${invalid ? ' invalid' : ''}`}
      ref={rootRef}
      data-testid={testId ? `${testId}-wrap` : undefined}
    >
      <button
        ref={triggerRef}
        type="button"
        className="lang-select-trigger"
        onClick={() => !disabled && setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        data-testid={testId}
      >
        <span className="lang-select-flag" aria-hidden="true">{selected.flag}</span>
        <span className="lang-select-text">
          <span className="lang-select-native">{inline ? selected.label : selected.native}</span>
          {!inline && !singleLine && selected.native !== selected.label ? (
            <span className="lang-select-label">{selected.label}</span>
          ) : null}
        </span>
        {!disabled && <span className="lang-select-chevron" aria-hidden="true" />}
      </button>

      {panel && createPortal(panel, document.body)}
    </div>
  )
}
