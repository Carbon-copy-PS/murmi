import { useState } from 'react'
import DivergingBarChart from './DivergingBarChart'
import SwipeDeck from './SwipeDeck'

function PendingStatementCard({ statement, counting, onApprove, onHold, onReject }) {
  return (
    <div className="flash-card statement-card pending-card" data-testid={`pending-${statement.id}`}>
      {statement.custom && <span className="card-tag">Custom</span>}
      <button
        className="pending-reject"
        onClick={() => onReject(statement.id)}
        title="Reject statement"
        aria-label="Reject statement"
        data-testid={`reject-${statement.id}`}
      >
        ×
      </button>
      <p className="flash-card-text">{statement.text}</p>

      {counting && (
        <div className="countdown" data-testid={`countdown-${statement.id}`}>
          <div className="countdown-track">
            <div className="countdown-fill" />
          </div>
          <span className="countdown-label">Auto-approving…</span>
        </div>
      )}

      <div className="flash-card-actions">
        {counting ? (
          <button
            className="vote-btn"
            onClick={() => onHold(statement.id)}
            data-testid={`hold-${statement.id}`}
          >
            Hold for review
          </button>
        ) : (
          <button
            className="vote-btn agree"
            onClick={() => onApprove(statement.id)}
            data-testid={`approve-${statement.id}`}
          >
            Approve
          </button>
        )}
      </div>
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
  onAddStatement,
  autoApprove = false,
  onToggleAutoApprove,
  heldIds,
  onHold,
  voteType = 'binary',
  onSetVoteType,
}) {
  const [justVotedId, setJustVotedId] = useState(null)
  const [localVoted, setLocalVoted] = useState(new Set())
  const [votesOpen, setVotesOpen] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [draft, setDraft] = useState('')

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
      {isHost && (
        <div className="host-toolbar" data-testid="host-toolbar">
          <div className="host-toolbar-group">
            <span
              className="host-toolbar-label"
              title={voteType === 'likert'
                ? 'Participants rate each statement from strongly disagree to strongly agree.'
                : 'Participants agree or disagree with each statement.'}
            >
              Vote scale
            </span>
            <div className="vote-type-seg" role="group" aria-label="Vote scale">
              <button
                type="button"
                className={`vote-type-opt ${voteType === 'binary' ? 'on' : ''}`}
                onClick={() => voteType !== 'binary' && onSetVoteType?.('binary')}
                aria-pressed={voteType === 'binary'}
                data-testid="vote-type-binary"
              >
                Agree / Disagree
              </button>
              <button
                type="button"
                className={`vote-type-opt ${voteType === 'likert' ? 'on' : ''}`}
                onClick={() => voteType !== 'likert' && onSetVoteType?.('likert')}
                aria-pressed={voteType === 'likert'}
                data-testid="vote-type-likert"
              >
                Likert (5-point)
              </button>
            </div>
          </div>
          <div className="host-toolbar-group">
            <span
              className="host-toolbar-label"
              title={isRecorder
                ? 'Statements from your mic go live after 5s unless you hold them for review.'
                : 'Your preference — applies to statements captured while you hold the mic.'}
            >
              Auto-approve
            </span>
            <label className="switch" data-testid="auto-approve-switch">
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={(e) => onToggleAutoApprove(e.target.checked)}
                data-testid="auto-approve-input"
              />
              <span className="switch-slider" />
            </label>
          </div>
        </div>
      )}

      {isHost && (
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
              Add statement
              {draft.trim() && !composerOpen && <span className="composer-draft-dot" aria-label="Draft in progress" />}
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
                  placeholder="e.g. Switzerland should regulate AI by sector, not with one broad law."
                  rows={2}
                  maxLength={240}
                  data-testid="composer-input"
                />
                <span className="composer-count">{draft.length}/240</span>
              </div>
              <div className="composer-footer">
                <span className="composer-hint">
                  <span className="composer-dot" aria-hidden="true" />
                  Shared instantly
                </span>
                <button
                  className="btn primary"
                  onClick={handleAdd}
                  disabled={!draft.trim()}
                  data-testid="composer-add"
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isHost && pending.length > 0 && (
        <>
          <div className="pending-header">
            <span className="pending-title">Pending approval</span>
            <span className="pending-count-text">{pending.length} waiting</span>
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
              />
            ))}
          </div>
        </>
      )}

      {approved.length === 0 && pending.length === 0 ? (
        <div className="flash-card-empty">Statements will appear as the debate progresses</div>
      ) : (
        <>
          {unvoted.length > 0 ? (
            <>
              {isHost && pending.length > 0 && (
                <div className="section-divider"><span>Live</span></div>
              )}
              <SwipeDeck statements={unvoted} onVote={handleVote} votedCount={voted.length} voteType={voteType} />
            </>
          ) : (
            approved.length > 0 && (
              <div className="flash-card-empty">All caught up — waiting for more statements</div>
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
                  Your votes
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
