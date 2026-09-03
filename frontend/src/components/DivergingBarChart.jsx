import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import NeutralIcon from './neutral-icon'
import { VOTE_COMMENT_MAX } from '../constants/limits'

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

function VoteCommentEditor({ stmt, onChangeVote }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(stmt.myComment || '')

  useEffect(() => {
    setDraft(stmt.myComment || '')
    setEditing(false)
  }, [stmt.id, stmt.myComment])

  if (!stmt.myVote) return null

  function save() {
    onChangeVote(stmt.id, stmt.myVote, draft.trim())
    setEditing(false)
  }

  const others = (stmt.comments || []).filter((c) => !c.isYou && c.text)

  return (
    <div className="vote-comment-box" data-testid={`vote-comment-${stmt.id}`}>
      <div className="vote-comment-mine">
        {editing ? (
          <>
            <textarea
              className="vote-comment-input"
              value={draft}
              maxLength={VOTE_COMMENT_MAX}
              rows={2}
              onChange={(e) => setDraft(e.target.value)}
              data-testid={`vote-comment-input-${stmt.id}`}
            />
            <div className="vote-comment-actions">
              <button type="button" className="btn ghost sm" onClick={() => setEditing(false)}>
                {t('common.cancel')}
              </button>
              <button type="button" className="btn primary sm" onClick={save} data-testid={`vote-comment-save-${stmt.id}`}>
                {t('common.save')}
              </button>
            </div>
          </>
        ) : stmt.myComment ? (
          <div className="vote-comment-row">
            <p className="vote-comment-text">
              <span className="vote-comment-name">{t('common.you')}</span>
              {stmt.myComment}
            </p>
            <div className="vote-comment-actions">
              <button
                type="button"
                className="vote-comment-icon-btn"
                onClick={() => setEditing(true)}
                aria-label={t('swipe.editComment')}
                title={t('swipe.editComment')}
                data-testid={`vote-comment-edit-${stmt.id}`}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
              <button
                type="button"
                className="vote-comment-icon-btn danger"
                onClick={() => onChangeVote(stmt.id, stmt.myVote, '')}
                aria-label={t('swipe.deleteComment')}
                title={t('swipe.deleteComment')}
                data-testid={`vote-comment-delete-${stmt.id}`}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 7h16" />
                  <path d="M9 7V4h6v3" />
                  <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn ghost sm" onClick={() => setEditing(true)} data-testid={`vote-comment-add-${stmt.id}`}>
            {t('swipe.addComment')}
          </button>
        )}
      </div>
      {others.length > 0 && (
        <ul className="vote-comment-list" data-testid={`vote-comments-${stmt.id}`}>
          {others.map((c, i) => (
            <li key={`${c.name}-${i}`}>
              <span className="vote-comment-name">{c.name}</span>
              {c.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

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
            {onChangeVote && <VoteCommentEditor stmt={stmt} onChangeVote={onChangeVote} />}
          </div>
        )
      })}
    </div>
  )
}
