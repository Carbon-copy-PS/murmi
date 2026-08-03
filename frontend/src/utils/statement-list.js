export function sortStatementsByNewest(statements) {
  return [...statements].sort(
    (a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0),
  )
}

export function statementSearchHaystack(statement, t) {
  const tags = []
  if (statement.edited) tags.push(t('tags.edited'))
  if (statement.tension) tags.push(t('tags.tension'))
  if (statement.custom && !statement.tension) tags.push(t('tags.custom'))

  const agrees = statement.agrees ?? 0
  const disagrees = statement.disagrees ?? 0

  return [
    statement.text,
    statement.author,
    ...tags,
    String(agrees),
    String(disagrees),
    String(agrees + disagrees),
    t('statements.voteCount', { agrees, disagrees, total: agrees + disagrees }),
  ].filter(Boolean).join(' ').toLowerCase()
}

export function filterStatementsBySearch(statements, query, t) {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return statements

  const terms = trimmed.split(/\s+/).filter(Boolean)
  return statements.filter((statement) => {
    const haystack = statementSearchHaystack(statement, t)
    return terms.every((term) => haystack.includes(term))
  })
}
