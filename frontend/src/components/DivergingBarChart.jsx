function truncate(text, max) {
  return text.length > max ? text.slice(0, max) + '...' : text
}

export default function DivergingBarChart({ statements, justVotedId, onAnimationDone }) {
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
          </div>
        )
      })}
    </div>
  )
}
