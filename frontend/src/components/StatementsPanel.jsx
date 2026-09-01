import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import DivergingBarChart from './DivergingBarChart'
import SwipeDeck from './SwipeDeck'
import { isAiStatement, StatementTags, StatementByline } from './statement-tags'
import { filterStatementsBySearch, sortStatementsByNewest } from '../utils/statement-list'

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

function ManagedStatementCard({ statement, onEdit, onDelete }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(statement.text)
  const voteTotal = (statement.agrees || 0) + (statement.disagrees || 0)

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
    <div className={`flash-card statement-card manage-card${editing ? ' is-editing' : ''}`} data-testid={`manage-${statement.id}`}>
      <StatementTags statement={statement} />
      <StatementByline statement={statement} />
      <div className="pending-card-tools">
        {!editing && (
          <button
            type="button"
            className="pending-edit"
            onClick={() => setEditing(true)}
            title={t('statements.editStatement')}
            aria-label={t('statements.editStatement')}
            data-testid={`manage-edit-${statement.id}`}
          >
            ✎
          </button>
        )}
        {!editing && (
          <button
            type="button"
            className="pending-reject"
            onClick={() => onDelete(statement)}
            title={t('statements.deleteStatement')}
            aria-label={t('statements.deleteStatement')}
            data-testid={`manage-delete-${statement.id}`}
          >
            ×
          </button>
        )}
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
            data-testid={`manage-edit-input-${statement.id}`}
          />
          <div className="pending-edit-actions">
            <button type="button" className="btn ghost sm" onClick={cancelEdit} data-testid={`manage-edit-cancel-${statement.id}`}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn primary sm"
              onClick={saveEdit}
              disabled={!draft.trim()}
              data-testid={`manage-edit-save-${statement.id}`}
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="flash-card-text">{statement.text}</p>
          <div className="manage-card-stats" data-testid={`manage-stats-${statement.id}`}>
            {t('statements.voteCount', { agrees: statement.agrees || 0, disagrees: statement.disagrees || 0, total: voteTotal })}
          </div>
        </>
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
  onDeleteStatement,
  onAddStatement,
  canAddStatement = false,
  statementSubmitted = false,
  onClearStatementSubmitted,
  autoApprove = false,
  heldIds,
  onHold,
  voteType = 'binary',
  votingActive = true,
}) {
  const { t } = useTranslation()
  const [justVotedId, setJustVotedId] = useState(null)
  const [localVoted, setLocalVoted] = useState(new Set())
  const [votesOpen, setVotesOpen] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(true)
  const [hostVotingOpen, setHostVotingOpen] = useState(false)
  const [manageSearch, setManageSearch] = useState('')
  const [draft, setDraft] = useState('')
  const showComposer = isHost || canAddStatement

  useEffect(() => {
    if (!statementSubmitted) return undefined
    const timer = setTimeout(() => onClearStatementSubmitted?.(), 4000)
    return () => clearTimeout(timer)
  }, [statementSubmitted, onClearStatementSubmitted])

  const held = heldIds || new Set()
  const pending = isHost ? statements.filter((s) => !s.approved) : []
  const approved = statements.filter((s) => s.approved)
  const unvoted = approved.filter((s) => !s.hasVoted && !localVoted.has(s.id))
  const voted = approved.filter((s) => s.hasVoted || localVoted.has(s.id))

  const managedStatements = useMemo(() => {
    const sorted = sortStatementsByNewest(approved)
    return filterStatementsBySearch(sorted, manageSearch, t)
  }, [statements, manageSearch, t])

  function handleVote(statementId, vote) {
    if (!votingActive) return
    const resolved = vote === 'pass' ? 'neutral' : vote
    setLocalVoted((prev) => new Set(prev).add(statementId))
    onVote(statementId, resolved)
    setJustVotedId(statementId)
    setVotesOpen(true)
  }

  function handleRevote(statementId, vote) {
    if (!votingActive) return
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

  const swipeDeck = unvoted.length > 0 && votingActive ? (
    <SwipeDeck statements={unvoted} onVote={handleVote} votedCount={voted.length} voteType={voteType} />
  ) : (
    approved.length > 0 && (
      <div className="flash-card-empty">{t('statements.allCaughtUp')}</div>
    )
  )

  return (
    <div className="statements-panel">
      {!votingActive && (
        <div className="voting-closed-banner" data-testid="voting-closed-banner" role="status">
          <span className="voting-closed-icon" aria-hidden="true">⏸</span>
          <div className="voting-closed-copy">
            <strong>{t('voting.closedTitle')}</strong>
            <span>{t('voting.closedDesc')}</span>
          </div>
        </div>
      )}
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
          {isHost && approved.length > 0 && (
            <div className="statements-manage" data-testid="statements-manage">
              <button
                type="button"
                className="votes-recap-toggle"
                onClick={() => setManageOpen((o) => !o)}
                aria-expanded={manageOpen}
                data-testid="statements-manage-toggle"
              >
                <span className="votes-recap-title">
                  {t('statements.allStatements')}
                  <span className="votes-recap-count">{approved.length}</span>
                </span>
                <span className={`votes-recap-chevron ${manageOpen ? 'open' : ''}`} aria-hidden="true">⌄</span>
              </button>

              {manageOpen && (
                <div className="statements-manage-panel">
                  <div className="statements-manage-search">
                    <svg className="statements-manage-search-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <input
                      type="text"
                      role="searchbox"
                      enterKeyHint="search"
                      className="statements-manage-search-input"
                      value={manageSearch}
                      onChange={(e) => setManageSearch(e.target.value)}
                      placeholder={t('statements.searchPlaceholder')}
                      aria-label={t('statements.searchAria')}
                      data-testid="statements-manage-search"
                    />
                    {manageSearch && (
                      <button
                        type="button"
                        className="statements-manage-search-clear"
                        onClick={() => setManageSearch('')}
                        aria-label={t('statements.clearSearch')}
                        data-testid="statements-manage-search-clear"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="statements-manage-body" data-testid="statements-manage-list">
                    {managedStatements.length === 0 ? (
                      <div className="flash-card-empty">{t('statements.noSearchResults')}</div>
                    ) : (
                      managedStatements.map((statement) => (
                        <ManagedStatementCard
                          key={statement.id}
                          statement={statement}
                          onEdit={onEditStatement}
                          onDelete={onDeleteStatement}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {isHost ? (
            approved.length > 0 && (
              <div className="host-voting-section" data-testid="host-voting-section">
                <button
                  type="button"
                  className="votes-recap-toggle"
                  onClick={() => setHostVotingOpen((o) => !o)}
                  aria-expanded={hostVotingOpen}
                  data-testid="host-voting-toggle"
                >
                  <span className="votes-recap-title">
                    {t('statements.voteOnStatements')}
                    {unvoted.length > 0 && votingActive && (
                      <span className="votes-recap-count">{unvoted.length}</span>
                    )}
                  </span>
                  <span className={`votes-recap-chevron ${hostVotingOpen ? 'open' : ''}`} aria-hidden="true">⌄</span>
                </button>

                {hostVotingOpen && (
                  <div className="host-voting-body">
                    {swipeDeck}
                  </div>
                )}
              </div>
            )
          ) : (
            swipeDeck
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
