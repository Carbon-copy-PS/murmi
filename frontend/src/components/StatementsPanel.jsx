import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import DivergingBarChart from './DivergingBarChart'
import SwipeDeck from './SwipeDeck'
import { isAiStatement, StatementTags, StatementByline } from './statement-tags'

function PendingStatementCard({ statement, counting, onApprove, onHold, onReject, onEdit, canEdit }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(statement.text)
  const showEdit = canEdit && isAiStatement(statement)

  useEffect(() => {
    setDraft(statement.text)
    setEditing(false)
  }, [statement.id, statement.text])

  function saveEdit() {
    const text = draft.trim()
    if (!text) return
    if (text !== statement.text) onEdit(statement.id, text)
    setEditing(false)
  }

  function cancelEdit() {
    setDraft(statement.text)
    setEditing(false)
  }

  return (
    <div className={`flash-card statement-card pending-card${editing ? ' is-editing' : ''}`} data-testid={`pending-${statement.id}`}>
      <StatementTags statement={statement} />
      <StatementByline statement={statement} />
      <div className="pending-card-tools">
        {showEdit && !editing && (
          <button
            type="button"
            className="pending-edit"
            onClick={() => setEditing(true)}
            title={t('statements.editStatement')}
            aria-label={t('statements.editStatement')}
            data-testid={`edit-${statement.id}`}
          >
            ✎
          </button>
        )}
        <button
          type="button"
          className="pending-reject"
          onClick={() => onReject(statement.id)}
          title={t('statements.rejectStatement')}
          aria-label={t('statements.rejectStatement')}
          data-testid={`reject-${statement.id}`}
        >
          ×
        </button>
      </div>

      {editing ? (
        <div className="pending-edit-body">
          <textarea
            className="pending-edit-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={240}
            autoFocus
            data-testid={`edit-input-${statement.id}`}
          />
          <div className="pending-edit-actions">
            <button type="button" className="btn ghost sm" onClick={cancelEdit} data-testid={`edit-cancel-${statement.id}`}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn primary sm"
              onClick={saveEdit}
              disabled={!draft.trim()}
              data-testid={`edit-save-${statement.id}`}
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      ) : (
        <p className="flash-card-text">{statement.text}</p>
      )}

      {counting && !editing && (
        <div className="countdown" data-testid={`countdown-${statement.id}`}>
          <div className="countdown-track">
            <div className="countdown-fill" />
          </div>
          <span className="countdown-label">{t('statements.autoApproving')}</span>
        </div>
      )}

      {!editing && (
        <div className="flash-card-actions">
          {counting ? (
            <button
              type="button"
              className="vote-btn"
              onClick={() => onHold(statement.id)}
              data-testid={`hold-${statement.id}`}
            >
              {t('statements.holdForReview')}
            </button>
          ) : (
            <button
              type="button"
              className="vote-btn agree"
              onClick={() => onApprove(statement.id)}
              data-testid={`approve-${statement.id}`}
            >
              {t('statements.approve')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function StatementsPanel({
  statements,
  onVote,
  isHost = false,
  isRecorder = false,
  onApprove,
  onReject,
  onEditStatement,
  onAddStatement,
  canAddStatement = false,
  statementSubmitted = false,
  onClearStatementSubmitted,
  autoApprove = false,
  heldIds,
  onHold,
  voteType = 'binary',
}) {
  const { t } = useTranslation()
  const [justVotedId, setJustVotedId] = useState(null)
  const [localVoted, setLocalVoted] = useState(new Set())
  const [votesOpen, setVotesOpen] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const showComposer = isHost || canAddStatement

  useEffect(() => {
    if (!statementSubmitted) return undefined
    const t = setTimeout(() => onClearStatementSubmitted?.(), 4000)
    return () => clearTimeout(t)
  }, [statementSubmitted, onClearStatementSubmitted])

  const held = heldIds || new Set()
  const pending = isHost ? statements.filter((s) => !s.approved) : []
  const approved = statements.filter((s) => s.approved)
  const unvoted = approved.filter((s) => !s.hasVoted && !localVoted.has(s.id))
  const voted = approved.filter((s) => s.hasVoted || localVoted.has(s.id))

  function handleVote(statementId, vote) {
    const resolved = vote === 'pass' ? 'neutral' : vote
    setLocalVoted((prev) => new Set(prev).add(statementId))
    onVote(statementId, resolved)
    setJustVotedId(statementId)
    setVotesOpen(true)
  }

  function handleRevote(statementId, vote) {
    if (vote === 'undo') {
      setLocalVoted((prev) => {
        const next = new Set(prev)
        next.delete(statementId)
        return next
      })
      onVote(statementId, 'undo')
      return
    }
    onVote(statementId, vote === 'pass' ? 'neutral' : vote)
    setJustVotedId(statementId)
  }

  function handleAdd() {
    const text = draft.trim()
    if (!text) return
    onAddStatement(text)
    setDraft('')
  }

  return (
    <div className="statements-panel">
      {showComposer && (
        <div className="host-composer" data-testid="host-composer">
          <button
            type="button"
            className="host-composer-toggle"
            onClick={() => {
              setComposerOpen((o) => {
                if (!o) setTimeout(() => document.getElementById('composer-input')?.focus(), 50)
                return !o
              })
            }}
            aria-expanded={composerOpen}
            data-testid="composer-toggle"
          >
            <span className="host-composer-toggle-label">
              <span className="composer-icon-sm" aria-hidden="true">＋</span>
              {isHost ? t('statements.addStatement') : t('statements.addArgument')}
              {draft.trim() && !composerOpen && <span className="composer-draft-dot" aria-label={t('statements.draftInProgress')} />}
            </span>
            <span className={`votes-recap-chevron ${composerOpen ? 'open' : ''}`} aria-hidden="true">⌄</span>
          </button>

          {composerOpen && (
            <div className="host-composer-body">
              <div className="composer-field">
                <textarea
                  id="composer-input"
                  className="composer-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t('statements.composerPlaceholder')}
                  rows={2}
                  maxLength={240}
                  data-testid="composer-input"
                />
                <span className="composer-count">{draft.length}/240</span>
              </div>
              <div className="composer-footer">
                <span className="composer-hint">
                  <span className="composer-dot" aria-hidden="true" />
                  {isHost ? t('statements.sharedInstantly') : t('statements.sentForReview')}
                </span>
                <button
                  className="btn primary"
                  onClick={handleAdd}
                  disabled={!draft.trim()}
                  data-testid="composer-add"
                >
                  {isHost ? t('statements.add') : t('statements.submit')}
                </button>
              </div>
              {!isHost && statementSubmitted && (
                <p className="composer-submitted" data-testid="composer-submitted">
                  <span aria-hidden="true">✓</span> {t('statements.submitted')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {isHost && pending.length > 0 && (
        <>
          <div className="pending-header">
            <span className="pending-title">{t('statements.pendingApproval')}</span>
            <span className="pending-count-text">{t('statements.waiting', { count: pending.length })}</span>
          </div>
          <div className="statement-list" data-testid="pending-list">
            {pending.map((statement) => (
              <PendingStatementCard
                key={statement.id}
                statement={statement}
                counting={isRecorder && autoApprove && !held.has(statement.id)}
                onApprove={onApprove}
                onHold={onHold}
                onReject={onReject}
                onEdit={onEditStatement}
                canEdit={isHost}
              />
            ))}
          </div>
        </>
      )}

      {approved.length === 0 && pending.length === 0 ? (
        <div className="flash-card-empty">{t('statements.emptyList')}</div>
      ) : (
        <>
          {unvoted.length > 0 ? (
            <>
              {isHost && pending.length > 0 && (
                <div className="section-divider"><span>{t('statements.live')}</span></div>
              )}
              <SwipeDeck statements={unvoted} onVote={handleVote} votedCount={voted.length} voteType={voteType} />
            </>
          ) : (
            approved.length > 0 && (
              <div className="flash-card-empty">{t('statements.allCaughtUp')}</div>
            )
          )}

          {voted.length > 0 && (
            <div className="votes-recap" data-testid="votes-recap">
              <button
                type="button"
                className="votes-recap-toggle"
                onClick={() => setVotesOpen((o) => !o)}
                aria-expanded={votesOpen}
                data-testid="votes-recap-toggle"
              >
                <span className="votes-recap-title">
                  {t('statements.yourVotes')}
                  <span className="votes-recap-count">{voted.length}</span>
                </span>
                <span className={`votes-recap-chevron ${votesOpen ? 'open' : ''}`} aria-hidden="true">⌄</span>
              </button>

              {votesOpen && (
                <div className="votes-recap-body">
                  <DivergingBarChart
                    statements={voted}
                    justVotedId={justVotedId}
                    onAnimationDone={() => setJustVotedId(null)}
                    onChangeVote={handleRevote}
                    voteType={voteType}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
