import {
  buildTensionAnalysisPayload,
  canGenerateTensions,
  computeDivisiveStatements,
} from './tension-stats'

const GROUP_LETTERS = ['A', 'B', 'C', 'D']

export { canGenerateTensions as canGenerateRecommendations, computeDivisiveStatements }

export function buildRecommendationsPayload(statements, cluster) {
  const base = buildTensionAnalysisPayload(statements)
  const payload = {
    ...base,
    existingTensions: statements
      .filter((s) => s.approved && s.tension)
      .map((s) => s.text),
    groups: [],
  }

  if (cluster?.groups?.length) {
    payload.groups = cluster.groups.map((g) => ({
      letter: GROUP_LETTERS[g.id],
      size: g.size,
      agree: (g.agree || []).map((s) => s.text),
      disagree: (g.disagree || []).map((s) => s.text),
      stronglyAgree: (g.stronglyAgree || []).map((s) => s.text),
      stronglyDisagree: (g.stronglyDisagree || []).map((s) => s.text),
    }))
  }

  return payload
}
