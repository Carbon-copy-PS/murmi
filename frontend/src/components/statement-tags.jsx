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

export function isAiStatement(statement) {
  return statement && !statement.custom && !statement.tension
}
