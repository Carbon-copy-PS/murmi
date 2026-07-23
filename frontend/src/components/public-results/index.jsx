import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { APP_NAME } from '../../constants/app'
import { resolveUiLanguage } from '../../i18n'
import ResultsPanel from '../ResultsPanel'
import ThemeToggle from '../ThemeToggle'

const POLL_INTERVAL_MS = 8000

function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function relativeTime(ts, t) {
  if (!ts) return ''
  const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (secs < 10) return t('public.justUpdated')
  if (secs < 60) return t('public.updatedSecs', { count: secs })
  const mins = Math.floor(secs / 60)
  if (mins < 60) return t('public.updatedMins', { count: mins })
  const hours = Math.floor(mins / 60)
  return t('public.updatedHours', { count: hours })
}

export default function PublicResults({ publicId }) {
  const { t, i18n } = useTranslation()
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')
  const [updatedAt, setUpdatedAt] = useState(null)
  const [copied, setCopied] = useState(false)
  const firstLoad = useRef(true)
  useNow(15000)

  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/results/${encodeURIComponent(publicId)}`)
      if (res.status === 404) {
        setStatus('notfound')
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setUpdatedAt(Date.now())
      setStatus('ready')
    } catch {
      if (firstLoad.current) setStatus('error')
    } finally {
      firstLoad.current = false
    }
  }, [publicId])

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_INTERVAL_MS)
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  useEffect(() => {
    const topic = data?.topic
    document.title = topic ? `${topic} · ${APP_NAME}` : `${t('public.title')} · ${APP_NAME}`
  }, [data?.topic, t])

  useEffect(() => {
    if (data) i18n.changeLanguage(resolveUiLanguage(data.language))
  }, [data?.language, i18n])

  const results = useMemo(
    () => (data ? { statements: data.statements || [], voters: data.voters || [] } : null),
    [data],
  )
  const statements = useMemo(
    () => (data?.statements || []).map((s) => ({ ...s, approved: true })),
    [data],
  )

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  async function nativeShare() {
    if (!navigator.share) return copyLink()
    try {
      await navigator.share({
        title: data?.topic || APP_NAME,
        text: data?.topic ? t('public.shareText', { topic: data.topic }) : t('public.shareTextGeneric'),
        url: shareUrl,
      })
    } catch {
      /* cancelled */
    }
  }

  const shareText = data?.topic
    ? t('public.shareText', { topic: data.topic })
    : t('public.shareTextGeneric')
  const enc = encodeURIComponent
  const socials = [
    { key: 'x', label: 'X', href: `https://twitter.com/intent/tweet?text=${enc(shareText)}&url=${enc(shareUrl)}` },
    { key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${enc(`${shareText} ${shareUrl}`)}` },
    { key: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(shareUrl)}` },
    { key: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(shareUrl)}` },
  ]

  if (status === 'loading') {
    return (
      <div className="pub-shell">
        <div className="pub-loading" data-testid="public-loading">
          <span className="pub-spinner" />
          <p>{t('public.loading')}</p>
        </div>
      </div>
    )
  }

  if (status === 'notfound' || status === 'error') {
    return (
      <div className="pub-shell">
        <div className="pub-empty-state" data-testid="public-notfound">
          <h1>{status === 'notfound' ? t('public.notFoundTitle') : t('public.errorTitle')}</h1>
          <p>{status === 'notfound' ? t('public.notFoundDesc') : t('public.errorDesc')}</p>
          <a className="pub-home-btn" href="/">{t('public.goHome')}</a>
        </div>
      </div>
    )
  }

  const participantCount = data?.participantCount || 0
  const hasResults = (data?.voters?.length || 0) > 0

  return (
    <div className="pub-shell" data-testid="public-results">
      <header className="pub-header">
        <div className="pub-header-top">
          <a className="pub-brand" href="/" data-testid="public-brand">
            <span className="pub-brand-dot" />
            {APP_NAME}
          </a>
          <div className="pub-header-actions">
            <span className="pub-live" data-testid="public-live">
              <span className="pub-live-dot" />
              {t('public.live')}
            </span>
            <ThemeToggle />
          </div>
        </div>
        <h1 className="pub-title" data-testid="public-topic">
          {data?.topic || t('public.title')}
        </h1>
        <div className="pub-meta">
          <span className="pub-meta-item">{t('public.participants', { count: participantCount })}</span>
          <span className="pub-meta-sep">·</span>
          <span className="pub-meta-item">{relativeTime(updatedAt, t)}</span>
        </div>

        <div className="pub-share" data-testid="public-share">
          <button className="pub-share-copy" onClick={copyLink} data-testid="public-copy">
            {copied ? t('public.copied') : t('public.copyLink')}
          </button>
          {typeof navigator !== 'undefined' && navigator.share && (
            <button className="pub-share-native" onClick={nativeShare} data-testid="public-native-share">
              {t('public.share')}
            </button>
          )}
          <div className="pub-social">
            {socials.map((s) => (
              <a
                key={s.key}
                className={`pub-social-btn ${s.key}`}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                data-testid={`public-social-${s.key}`}
              >
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </header>

      <main className="pub-body">
        {hasResults ? (
          <ResultsPanel
            statements={statements}
            results={results}
            isHost={false}
            publicView
            topic={data?.topic}
            voteType={data?.voteType || 'binary'}
            commonGroundHistory={data?.commonGroundHistory || []}
          />
        ) : (
          <div className="pub-empty-state" data-testid="public-no-votes">
            <h2>{t('public.noResultsTitle')}</h2>
            <p>{t('public.noResultsDesc')}</p>
          </div>
        )}
      </main>

      <footer className="pub-footer">
        <span>{t('public.poweredBy', { app: APP_NAME })}</span>
      </footer>
    </div>
  )
}
