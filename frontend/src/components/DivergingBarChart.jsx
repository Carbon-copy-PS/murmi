function truncate(text, max) {
  return text.length > max ? text.slice(0, max) + '...' : text
}

const VOTE_LABEL = { agree: 'Agree', disagree: 'Disagree', neutral: 'Pass' }

export default function DivergingBarChart({ statements, justVotedId, onAnimationDone, onChangeVote }) {
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
              <div className="bar-revote" data-testid={`revote-${stmt.id}`}>
                <span className="bar-myvote">
                  You: <strong className={stmt.myVote}>{VOTE_LABEL[stmt.myVote] || '—'}</strong>
                </span>
                <div className="bar-revote-actions">
                  <button
                    className={`revote-chip agree ${stmt.myVote === 'agree' ? 'on' : ''}`}
                    onClick={() => onChangeVote(stmt.id, 'agree')}
                    aria-label="Change vote to agree"
                    data-testid={`revote-agree-${stmt.id}`}
                  >✓</button>
                  <button
                    className={`revote-chip disagree ${stmt.myVote === 'disagree' ? 'on' : ''}`}
                    onClick={() => onChangeVote(stmt.id, 'disagree')}
                    aria-label="Change vote to disagree"
                    data-testid={`revote-disagree-${stmt.id}`}
                  >✕</button>
                  <button
                    className={`revote-chip pass ${stmt.myVote === 'neutral' ? 'on' : ''}`}
                    onClick={() => onChangeVote(stmt.id, 'pass')}
                    aria-label="Change vote to pass"
                    data-testid={`revote-pass-${stmt.id}`}
                  >↓</button>
                  <button
                    className="revote-undo"
                    onClick={() => onChangeVote(stmt.id, 'undo')}
                    data-testid={`revote-undo-${stmt.id}`}
                  >Undo</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
