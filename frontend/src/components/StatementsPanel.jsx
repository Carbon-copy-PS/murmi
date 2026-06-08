import { useState } from 'react'
import DivergingBarChart from './DivergingBarChart'
import SwipeDeck from './SwipeDeck'

function PendingStatementCard({ statement, counting, onApprove, onHold }) {
  return (
    <div className="flash-card statement-card pending-card" data-testid={`pending-${statement.id}`}>
      {statement.custom && <span className="card-tag">Custom</span>}
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
  onApprove,
  onAddStatement,
  autoApprove = false,
  onToggleAutoApprove,
  heldIds,
  onHold,
}) {
  const [justVotedId, setJustVotedId] = useState(null)
  const [localVoted, setLocalVoted] = useState(new Set())
  const [votesOpen, setVotesOpen] = useState(false)
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

  function handleAdd() {
    const text = draft.trim()
    if (!text) return
    onAddStatement(text)
    setDraft('')
  }

  return (
    <div className="statements-panel">
      {isHost && (
        <div className="auto-approve-bar" data-testid="auto-approve-bar">
          <div className="auto-approve-text">
            <span className="auto-approve-title">Auto-approve</span>
            <p className="auto-approve-desc">
              New statements go live after 5s unless you hold them for review.
            </p>
          </div>
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
      )}

      {isHost && (
        <div className="host-composer" data-testid="host-composer">
          <div className="composer-head">
            <span className="composer-icon" aria-hidden="true">＋</span>
            <div>
              <label className="composer-label" htmlFor="composer-input">Add a statement</label>
              <p className="composer-sub">Phrase a claim participants can agree or disagree with.</p>
            </div>
          </div>

          <div className="composer-field">
            <textarea
              id="composer-input"
              className="composer-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. Switzerland should regulate AI by sector, not with one broad law."
              rows={3}
              maxLength={240}
              data-testid="composer-input"
            />
            <span className="composer-count">{draft.length}/240</span>
          </div>

          <div className="composer-footer">
            <span className="composer-hint">
              <span className="composer-dot" aria-hidden="true" />
              Shared instantly with everyone
            </span>
            <button
              className="btn primary"
              onClick={handleAdd}
              disabled={!draft.trim()}
              data-testid="composer-add"
            >
              Add statement
            </button>
          </div>
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
                counting={autoApprove && !held.has(statement.id)}
                onApprove={onApprove}
                onHold={onHold}
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
              <SwipeDeck statements={unvoted} onVote={handleVote} votedCount={voted.length} />
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
