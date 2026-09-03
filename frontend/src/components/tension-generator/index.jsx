import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  buildRecommendationsPayload,
  canGenerateRecommendations,
  computeDivisiveStatements,
} from '../../utils/recommendations-payload'
import { STATEMENT_TEXT_MAX } from '../../constants/limits'

const COUNT_OPTIONS = [1, 2, 3, 4, 5]

function truncate(text, max = 72) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function ReadOnlyCategory({ label, items, testId }) {
  const { t } = useTranslation()
  if (!items?.length) return null
  return (
    <div className="rec-category rec-readonly" data-testid={testId}>
      <span className="rec-category-label">{label}</span>
      <ul className="rec-bullets">
        {items.map((item, i) => (
          <li key={`${testId}-${i}`}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

export default function RecommendationsPanel({
  statements,
  cluster = null,
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
  const [divisiveItems, setDivisiveItems] = useState([])
  const [unexploredTopics, setUnexploredTopics] = useState([])
  const [proposedSolutions, setProposedSolutions] = useState([])

  const canGenerate = useMemo(() => canGenerateRecommendations(statements), [statements])
  const divisive = useMemo(() => computeDivisiveStatements(statements, 4), [statements])
  const existingTensions = useMemo(
    () => statements.filter((s) => s.approved && s.tension),
    [statements],
  )
  const analysis = useMemo(
    () => buildRecommendationsPayload(statements, cluster),
    [statements, cluster],
  )

  useEffect(() => {
    if (drafts) {
      setUnexploredTopics(drafts.unexploredTopics || [])
      setProposedSolutions(drafts.proposedSolutions || [])
      setDivisiveItems(
        (drafts.divisiveIssues || []).map((d) => ({ ...d, included: true })),
      )
      setOpen(true)
    }
  }, [drafts])

  const included = divisiveItems.filter((i) => i.included && i.text.trim())
  const step = divisiveItems.length ? 'review' : 'configure'
  const hasDrafts = divisiveItems.length > 0 || unexploredTopics.length > 0 || proposedSolutions.length > 0
  const readyCount = included.length

  function handleGenerate() {
    onGenerate?.(count, analysis)
  }

  function handlePublish() {
    const texts = included.map((i) => i.text.trim()).filter(Boolean)
    if (!texts.length) return
    onPublish?.(texts)
    setDivisiveItems([])
    setUnexploredTopics([])
    setProposedSolutions([])
    onClearDrafts?.()
    setOpen(false)
  }

  function handleDiscard() {
    setDivisiveItems([])
    setUnexploredTopics([])
    setProposedSolutions([])
    onClearDrafts?.()
  }

  function updateText(id, text) {
    setDivisiveItems((prev) => prev.map((i) => (i.id === id ? { ...i, text } : i)))
  }

  function toggleIncluded(id) {
    setDivisiveItems((prev) => prev.map((i) => (i.id === id ? { ...i, included: !i.included } : i)))
  }

  function removeItem(id) {
    setDivisiveItems((prev) => prev.filter((i) => i.id !== id))
  }

  if (!canGenerate) return null

  return (
    <section className="tension-gen rec-panel" data-testid="recommendations-panel">
      <button
        type="button"
        className="tension-gen-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="recommendations-toggle"
      >
        <span className="tension-gen-toggle-label">
          <span className="tension-gen-icon" aria-hidden="true">⚡</span>
          {t('tension.surface')}
          {hasDrafts && !open && readyCount > 0 && (
            <span className="tension-gen-badge" data-testid="recommendations-draft-badge">
              {t('recommendations.ready', { count: readyCount })}
            </span>
          )}
        </span>
        <span className={`votes-recap-chevron ${open ? 'open' : ''}`} aria-hidden="true">⌄</span>
      </button>

      {open && (
        <div className="tension-gen-body" data-testid="recommendations-body">
          <p className="tension-gen-lead">{t('recommendations.lead')}</p>

          <div className="tension-steps" aria-label={t('recommendations.progressAria')}>
            <span className={`tension-step ${step === 'configure' ? 'on' : 'done'}`}>{t('recommendations.stepConfigure')}</span>
            <span className={`tension-step ${step === 'review' ? 'on' : ''}`}>{t('recommendations.stepReview')}</span>
            <span className="tension-step">{t('recommendations.stepGoLive')}</span>
          </div>

          {divisive.length > 0 && (
            <div className="tension-source" data-testid="recommendations-source">
              <span className="tension-source-label">{t('recommendations.mostDivisive')}</span>
              <ul className="tension-source-list">
                {divisive.map((s) => (
                  <li key={s.id} className="tension-source-item">
                    <span className="tension-source-split">{t('recommendations.split', { pct: Math.round(s.split * 100) })}</span>
                    <span className="tension-source-text">{truncate(s.text)}</span>
                    <span className="tension-source-votes">{s.agree}↑ {s.disagree}↓</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {existingTensions.length > 0 && (
            <div className="tension-source rec-current-tensions" data-testid="recommendations-current-tensions">
              <span className="tension-source-label">{t('tension.currentTensions')}</span>
              <ul className="tension-source-list">
                {existingTensions.map((s) => (
                  <li key={s.id} className="tension-source-item tension-source-item-full">
                    <span className="tension-source-text">{s.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 'configure' && (
            <div className="tension-config" data-testid="recommendations-config">
              <span className="tension-config-label">{t('recommendations.howMany')}</span>
              <div className="tension-count-seg" role="group" aria-label={t('recommendations.numberOf')}>
                {COUNT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`tension-count-opt ${count === n ? 'on' : ''}`}
                    onClick={() => setCount(n)}
                    aria-pressed={count === n}
                    data-testid={`recommendations-count-${n}`}
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
                data-testid="recommendations-generate"
              >
                {pending ? t('recommendations.generating') : t('recommendations.generate', { count })}
              </button>
            </div>
          )}

          {pending && (
            <div className="tension-loading" data-testid="recommendations-loading">
              <span className="cg-spinner" aria-hidden="true" />
              {t('recommendations.drafting')}
            </div>
          )}

          {error && !pending && (
            <p className="tension-error" data-testid="recommendations-error">{error}</p>
          )}

          {hasDrafts && !pending && (
            <div className="tension-review rec-review" data-testid="recommendations-review">
              <div className="tension-review-head">
                <span className="tension-review-title">{t('recommendations.reviewTitle')}</span>
                <button
                  type="button"
                  className="tension-link-btn"
                  onClick={handleGenerate}
                  disabled={pending}
                  data-testid="recommendations-regenerate"
                >
                  {t('recommendations.regenerate')}
                </button>
              </div>

              <ReadOnlyCategory
                label={t('recommendations.unexploredTopics')}
                items={unexploredTopics}
                testId="recommendations-unexplored"
              />

              {divisiveItems.length > 0 ? (
                <div className="rec-category" data-testid="recommendations-divisive">
                  <span className="rec-category-label">{t('recommendations.divisiveIssues')}</span>
                  <ul className="tension-draft-list">
                    {divisiveItems.map((item) => (
                      <li key={item.id} className={`tension-draft ${item.included ? '' : 'off'}`}>
                        <label className="tension-draft-check">
                          <input
                            type="checkbox"
                            checked={item.included}
                            onChange={() => toggleIncluded(item.id)}
                            data-testid={`recommendations-include-${item.id}`}
                          />
                          <span className="tension-draft-tag">{t('recommendations.tag')}</span>
                        </label>
                        <textarea
                          className="tension-draft-input"
                          value={item.text}
                          onChange={(e) => updateText(item.id, e.target.value)}
                          rows={2}
                          maxLength={STATEMENT_TEXT_MAX}
                          data-testid={`recommendations-text-${item.id}`}
                        />
                        <button
                          type="button"
                          className="tension-draft-remove"
                          onClick={() => removeItem(item.id)}
                          aria-label={t('recommendations.removeDraft')}
                          data-testid={`recommendations-remove-${item.id}`}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="rec-empty-category">{t('recommendations.emptyCategory')}</p>
              )}

              <ReadOnlyCategory
                label={t('recommendations.proposedSolutions')}
                items={proposedSolutions}
                testId="recommendations-solutions"
              />

              <div className="tension-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={handleDiscard}
                  data-testid="recommendations-discard"
                >
                  {t('recommendations.discard')}
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!included.length}
                  onClick={handlePublish}
                  data-testid="recommendations-publish"
                >
                  {t('recommendations.pushToLive', { count: included.length })}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
