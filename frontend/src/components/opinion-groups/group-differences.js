// Descriptive contrasts within the current grouping, not causes or significance tests.
export function selectGroupDifferences(groups) {
  if (!Array.isArray(groups) || groups.length < 2) return []
  const indexes = groups.map(group => new Map((group.statements || []).map(s => [s.id, s])))
  return [...indexes[0].values()].flatMap(statement => {
    const rows = groups.map((group, index) => ({ group, statement: indexes[index].get(statement.id) }))
    if (rows.some(({ group, statement: s }) => !s || !Number.isFinite(group.size) || group.size <= 0
      || !Number.isFinite(s.responded) || s.responded < 5 || s.responded < group.size / 2
      || s.responded > group.size || [s.agree, s.neutral, s.disagree].some(n => !Number.isFinite(n) || n < 0)
      || s.agree + s.neutral + s.disagree !== s.responded)) return []
    const rates = rows.map(({ statement: s }) => s.agree / s.responded)
    const gap = Math.max(...rates) - Math.min(...rates)
    return gap >= .2 ? [{ id: statement.id, text: statement.text, gap, rows }] : []
  }).sort((a, b) => b.gap - a.gap || a.id.localeCompare(b.id)).slice(0, 2)
}
