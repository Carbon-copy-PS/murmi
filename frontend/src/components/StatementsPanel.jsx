export default function StatementsPanel({ statements, onVote }) {
  const rounds = [...new Set(statements.map((s) => s.round))].sort((a, b) => b - a)

  if (statements.length === 0) {
    return <div className="statements empty">Statements will appear as the debate progresses</div>
  }

  return (
    <div className="statements">
      {rounds.map((round) => (
        <div key={round}>
          <h3 className="round-header">Round {round}</h3>
          {statements
            .filter((s) => s.round === round)
            .map((stmt) => (
              <div key={stmt.id} className="statement-card">
                <p className="statement-text">{stmt.text}</p>
                <div className="vote-row">
                  <button
                    className={`vote-btn agree ${stmt.myVote === 'agree' ? 'voted' : ''}`}
                    onClick={() => onVote(stmt.id, 'agree')}
                    disabled={stmt.hasVoted}
                  >
                    Agree {stmt.agrees > 0 && stmt.agrees}
                  </button>
                  <button
                    className={`vote-btn disagree ${stmt.myVote === 'disagree' ? 'voted' : ''}`}
                    onClick={() => onVote(stmt.id, 'disagree')}
                    disabled={stmt.hasVoted}
                  >
                    Disagree {stmt.disagrees > 0 && stmt.disagrees}
                  </button>
                </div>
              </div>
            ))}
        </div>
      ))}
    </div>
  )
}
