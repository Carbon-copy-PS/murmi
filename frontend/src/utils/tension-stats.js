export function computeDivisiveStatements(statements, limit = 8) {
  return statements
    .filter((s) => s.approved)
    .map((s) => {
      const agree = s.agrees || 0
      const disagree = s.disagrees || 0
      const total = agree + disagree
      const agreeRate = total ? agree / total : 0
      const split = total ? 1 - Math.abs(agreeRate - 0.5) * 2 : 0
      return { id: s.id, text: s.text, agree, disagree, total, split, agreeRate }
    })
    .filter((s) => s.total >= 2)
    .sort((a, b) => b.split - a.split)
    .slice(0, limit)
}

export function canGenerateTensions(statements) {
  return computeDivisiveStatements(statements, 1).length > 0
}

export function buildTensionAnalysisPayload(statements) {
  const divisive = computeDivisiveStatements(statements, 6)
  const voted = statements.filter((s) => s.approved && (s.agrees || 0) + (s.disagrees || 0) >= 2)
  const consensus = [...voted]
    .map((s) => {
      const total = (s.agrees || 0) + (s.disagrees || 0)
      const agreeRate = total ? s.agrees / total : 0
      return { text: s.text, agree: s.agrees, disagree: s.disagrees, agreeRate }
    })
    .sort((a, b) => Math.abs(b.agreeRate - 0.5) - Math.abs(a.agreeRate - 0.5))
    .slice(0, 3)

  return {
    divisive: divisive.map((s) => ({
      text: s.text,
      agree: s.agree,
      disagree: s.disagree,
      splitPct: Math.round(s.split * 100),
    })),
    consensus: consensus.map((s) => ({
      text: s.text,
      agree: s.agree,
      disagree: s.disagree,
    })),
    existingStatements: statements.filter((s) => s.approved).map((s) => s.text),
  }
}
