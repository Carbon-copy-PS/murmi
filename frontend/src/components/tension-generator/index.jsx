import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  buildTensionAnalysisPayload,
  canGenerateTensions,
  computeDivisiveStatements,
} from '../../utils/tension-stats'

const COUNT_OPTIONS = [1, 2, 3, 4, 5]

function truncate(text, max = 72) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export default function TensionGenerator({
  statements,
  pending = false,
  error = null,
  drafts = null,
  onGenerate,
  onPublish,
  onClearDrafts,
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(3)
  const [items, setItems] = useState([])

  const canGenerate = useMemo(() => canGenerateTensions(statements), [statements])
  const divisive = useMemo(() => computeDivisiveStatements(statements, 4), [statements])
  const analysis = useMemo(() => buildTensionAnalysisPayload(statements), [statements])

  useEffect(() => {
    if (drafts?.length) {
      setItems(drafts.map((d) => ({ ...d, included: true })))
      setOpen(true)
    }
  }, [drafts])

  const included = items.filter((i) => i.included && i.text.trim())
  const step = items.length ? 'review' : 'configure'

  function handleGenerate() {
    onGenerate?.(count, analysis)
  }

  function handlePublish() {
    const texts = included.map((i) => i.text.trim()).filter(Boolean)
    if (!texts.length) return
    onPublish?.(texts)
    setItems([])
    onClearDrafts?.()
    setOpen(false)
  }

  function handleDiscard() {
    setItems([])
    onClearDrafts?.()
  }

  function updateText(id, text) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, text } : i)))
  }

  function toggleIncluded(id) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, included: !i.included } : i)))
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  if (!canGenerate) return null

  return (
    <section className="tension-gen" data-testid="tension-generator">
      <button
        type="button"
        className="tension-gen-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="tension-gen-toggle"
      >
        <span className="tension-gen-toggle-label">
          <span className="tension-gen-icon" aria-hidden="true">⚡</span>
          {t('tension.surface')}
          {items.length > 0 && !open && (
            <span className="tension-gen-badge" data-testid="tension-draft-badge">{t('tension.ready', { count: included.length })}</span>
          )}
        </span>
        <span className={`votes-recap-chevron ${open ? 'open' : ''}`} aria-hidden="true">⌄</span>
      </button>

      {open && (
        <div className="tension-gen-body" data-testid="tension-gen-body">
          <p className="tension-gen-lead">
            {t('tension.lead')}
          </p>

          <div className="tension-steps" aria-label={t('tension.progressAria')}>
            <span className={`tension-step ${step === 'configure' ? 'on' : 'done'}`}>{t('tension.stepConfigure')}</span>
            <span className={`tension-step ${step === 'review' ? 'on' : ''}`}>{t('tension.stepReview')}</span>
            <span className="tension-step">{t('tension.stepGoLive')}</span>
          </div>

          {divisive.length > 0 && (
            <div className="tension-source" data-testid="tension-source">
              <span className="tension-source-label">{t('tension.mostDivisive')}</span>
              <ul className="tension-source-list">
                {divisive.map((s) => (
                  <li key={s.id} className="tension-source-item">
                    <span className="tension-source-split">{t('tension.split', { pct: Math.round(s.split * 100) })}</span>
                    <span className="tension-source-text">{truncate(s.text)}</span>
                    <span className="tension-source-votes">{s.agree}↑ {s.disagree}↓</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 'configure' && (
            <div className="tension-config" data-testid="tension-config">
              <span className="tension-config-label">{t('tension.howMany')}</span>
              <div className="tension-count-seg" role="group" aria-label={t('tension.numberOf')}>
                {COUNT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`tension-count-opt ${count === n ? 'on' : ''}`}
                    onClick={() => setCount(n)}
                    aria-pressed={count === n}
                    data-testid={`tension-count-${n}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn primary tension-generate-btn"
                disabled={pending}
                onClick={handleGenerate}
                data-testid="tension-generate"
              >
                {pending ? t('tension.generating') : t('tension.generate', { count })}
              </button>
            </div>
          )}

          {pending && (
            <div className="tension-loading" data-testid="tension-loading">
              <span className="cg-spinner" aria-hidden="true" />
              {t('tension.drafting')}
            </div>
          )}

          {error && !pending && (
            <p className="tension-error" data-testid="tension-error">{error}</p>
          )}

          {items.length > 0 && !pending && (
            <div className="tension-review" data-testid="tension-review">
              <div className="tension-review-head">
                <span className="tension-review-title">{t('tension.reviewTitle')}</span>
                <button
                  type="button"
                  className="tension-link-btn"
                  onClick={handleGenerate}
                  disabled={pending}
                  data-testid="tension-regenerate"
                >
                  {t('tension.regenerate')}
                </button>
              </div>

              <ul className="tension-draft-list">
                {items.map((item) => (
                  <li key={item.id} className={`tension-draft ${item.included ? '' : 'off'}`}>
                    <label className="tension-draft-check">
                      <input
                        type="checkbox"
                        checked={item.included}
                        onChange={() => toggleIncluded(item.id)}
                        data-testid={`tension-include-${item.id}`}
                      />
                      <span className="tension-draft-tag">{t('tension.tag')}</span>
                    </label>
                    <textarea
                      className="tension-draft-input"
                      value={item.text}
                      onChange={(e) => updateText(item.id, e.target.value)}
                      rows={2}
                      maxLength={240}
                      data-testid={`tension-text-${item.id}`}
                    />
                    <button
                      type="button"
                      className="tension-draft-remove"
                      onClick={() => removeItem(item.id)}
                      aria-label={t('tension.removeDraft')}
                      data-testid={`tension-remove-${item.id}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>

              <div className="tension-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={handleDiscard}
                  data-testid="tension-discard"
                >
                  {t('tension.discard')}
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!included.length}
                  onClick={handlePublish}
                  data-testid="tension-publish"
                >
                  {t('tension.pushToLive', { count: included.length })}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
