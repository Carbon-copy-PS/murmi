export function StatementTags({ statement }) {
  if (!statement?.edited && !statement?.tension && !statement?.custom) return null
  return (
    <div className="statement-tags">
      {statement.edited && <span className="card-tag edited">Edited</span>}
      {statement.tension && <span className="card-tag tension">Tension</span>}
      {statement.custom && !statement.tension && <span className="card-tag">Custom</span>}
    </div>
  )
}

function formatAddedRelative(ts) {
  if (!ts) return ''
  const mins = Math.floor(Math.max(0, Date.now() - ts * 1000) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function StatementByline({ statement }) {
  if (!statement?.author) return null
  return (
    <div className="statement-byline" data-testid={`statement-byline-${statement.id}`}>
      <span className="statement-byline-avatar" aria-hidden="true">
        {statement.author.trim().charAt(0).toUpperCase() || '?'}
      </span>
      <span className="statement-byline-text">
        Added by <strong>{statement.author}</strong>
        {statement.createdAt && (
          <span className="statement-byline-meta"> · {formatAddedRelative(statement.createdAt)}</span>
        )}
      </span>
    </div>
  )
}

export function isAiStatement(statement) {
  return statement && !statement.custom && !statement.tension
}
