import { useTranslation } from 'react-i18next'
import NeutralIcon from './neutral-icon'

function truncate(text, max) {
  return text.length > max ? text.slice(0, max) + '...' : text
}

const VOTE_LABEL_KEY = {
  strongly_agree: 'common.stronglyAgree',
  agree: 'common.agree',
  neutral: 'common.neutral',
  disagree: 'common.disagree',
  strongly_disagree: 'common.stronglyDisagree',
}

const LIKERT_CHIPS = [
  { vote: 'strongly_disagree', cls: 'disagree strong', glyph: '⇤', labelKey: 'common.stronglyDisagree' },
  { vote: 'disagree', cls: 'disagree', glyph: '✕', labelKey: 'common.disagree' },
  { vote: 'pass', cls: 'pass', glyph: <NeutralIcon size={14} />, labelKey: 'common.neutral', match: 'neutral' },
  { vote: 'agree', cls: 'agree', glyph: '✓', labelKey: 'common.agree' },
  { vote: 'strongly_agree', cls: 'agree strong', glyph: '⇥', labelKey: 'common.stronglyAgree' },
]

const BINARY_CHIPS = [
  { vote: 'agree', cls: 'agree', glyph: '✓', labelKey: 'common.agree' },
  { vote: 'disagree', cls: 'disagree', glyph: '✕', labelKey: 'common.disagree' },
  { vote: 'pass', cls: 'pass', glyph: <NeutralIcon size={14} />, labelKey: 'common.neutral', match: 'neutral' },
]

export default function DivergingBarChart({ statements, justVotedId, onAnimationDone, onChangeVote, voteType = 'binary' }) {
  const { t } = useTranslation()
  const chips = voteType === 'likert' ? LIKERT_CHIPS : BINARY_CHIPS
  return (
    <div className="bar-chart">
      {[...statements].reverse().map((stmt) => {
        const max = Math.max(stmt.agrees, stmt.disagrees, 1)
        const agreeWidth = (stmt.agrees / max) * 50
        const disagreeWidth = (stmt.disagrees / max) * 50
        const isNew = stmt.id === justVotedId

        return (
          <div
            key={stmt.id}
            className={`bar-row ${isNew ? 'bar-enter' : ''}`}
            onAnimationEnd={() => { if (isNew) onAnimationDone() }}
          >
            <p className="bar-label">{truncate(stmt.text, 55)}</p>
            <div className="bar-track">
              <div
                className="bar-disagree"
                style={{ width: `${disagreeWidth}%` }}
              >
                {stmt.disagrees > 0 && (
                  <span className="bar-count left">{stmt.disagrees}</span>
                )}
              </div>
              <div className="bar-center-line" />
              <div
                className="bar-agree"
                style={{ width: `${agreeWidth}%` }}
              >
                {stmt.agrees > 0 && (
                  <span className="bar-count right">{stmt.agrees}</span>
                )}
              </div>
              {isNew && <div className={`bar-pulse ${stmt.myVote}`} />}
            </div>

            {onChangeVote && (
              <div className={`bar-revote ${voteType === 'likert' ? 'likert' : ''}`} data-testid={`revote-${stmt.id}`}>
                <span className="bar-myvote">
                  {t('revote.you')} <strong className={stmt.myVote}>{stmt.myVote ? t(VOTE_LABEL_KEY[stmt.myVote]) : t('revote.none')}</strong>
                </span>
                <div className="bar-revote-actions">
                  {chips.map((c) => {
                    const active = stmt.myVote === (c.match || c.vote)
                    const label = t(c.labelKey)
                    return (
                      <button
                        key={c.vote}
                        className={`revote-chip ${c.cls} ${active ? 'on' : ''}`}
                        onClick={() => onChangeVote(stmt.id, c.vote)}
                        aria-label={t('revote.changeVoteTo', { label: label.toLowerCase() })}
                        title={label}
                        data-testid={`revote-${c.vote}-${stmt.id}`}
                      >{c.glyph}</button>
                    )
                  })}
                  <button
                    className="revote-undo"
                    onClick={() => onChangeVote(stmt.id, 'undo')}
                    data-testid={`revote-undo-${stmt.id}`}
                  >{t('revote.undo')}</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
