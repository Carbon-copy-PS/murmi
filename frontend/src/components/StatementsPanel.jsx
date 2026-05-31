import { useState } from 'react'
import DivergingBarChart from './DivergingBarChart'

export default function StatementsPanel({ statements, onVote }) {
  const [justVotedId, setJustVotedId] = useState(null)
  const [localVoted, setLocalVoted] = useState(new Set())

  const unvoted = statements.filter((s) => !s.hasVoted && !localVoted.has(s.id))
  const voted = statements.filter((s) => s.hasVoted || localVoted.has(s.id))

  function handleVote(statementId, vote) {
    setLocalVoted((prev) => new Set(prev).add(statementId))
    onVote(statementId, vote)
    setJustVotedId(statementId)
  }

  if (statements.length === 0) {
    return <div className="flash-card-empty">Statements will appear as the debate progresses</div>
  }

  return (
    <div className="statements-panel">
      {unvoted.length > 0 ? (
        <div className="statement-list">
          {unvoted.map((statement) => (
            <div key={statement.id} className="flash-card statement-card">
              <p className="flash-card-text">{statement.text}</p>
              <div className="flash-card-actions">
                <button
                  className="vote-btn disagree"
                  onClick={() => handleVote(statement.id, 'disagree')}
                >
                  Disagree
                </button>
                <button
                  className="vote-btn agree"
                  onClick={() => handleVote(statement.id, 'agree')}
                >
                  Agree
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flash-card-empty">All caught up — waiting for more statements</div>
      )}

      {voted.length > 0 && (
        <>
          <div className="section-divider"><span>Your votes</span></div>
          <DivergingBarChart
            statements={voted}
            justVotedId={justVotedId}
            onAnimationDone={() => setJustVotedId(null)}
          />
        </>
      )}
    </div>
  )
}
