export const CG_MODE_OPTIONS = [
  {
    id: 'generic',
    label: 'Generic',
    hint: 'Shared positions, disagreements, and a bridge',
  },
  {
    id: 'policy',
    label: 'Policy',
    hint: 'Recommendations, conditions, and unresolved issues',
    recommended: true,
  },
]

export const CG_MODE_LABELS = Object.fromEntries(
  CG_MODE_OPTIONS.map((o) => [o.id, o.label]),
)

export const DEFAULT_CG_MODE = 'policy'

const LEGACY_DEPTH_TO_MODE = {
  basic: 'generic',
  extended: 'generic',
  comprehensive: 'generic',
}

/** Resolve mode from a history item or session field, including legacy depth ids. */
export function resolveCgMode(itemOrMode) {
  if (typeof itemOrMode === 'string') {
    if (CG_MODE_LABELS[itemOrMode]) return itemOrMode
    return LEGACY_DEPTH_TO_MODE[itemOrMode] || DEFAULT_CG_MODE
  }
  if (!itemOrMode || typeof itemOrMode !== 'object') return DEFAULT_CG_MODE
  const raw = itemOrMode.mode || itemOrMode.depth
  if (CG_MODE_LABELS[raw]) return raw
  return LEGACY_DEPTH_TO_MODE[raw] || DEFAULT_CG_MODE
}

/** True when this version should render with policy common-ground sections. */
export function isPolicyCommonGround(item) {
  if (!item) return false
  const recs = item.recommendations
  if (Array.isArray(recs) && recs.length > 0) return true
  return resolveCgMode(item) === 'policy'
}

export const CG_VOTE_REASON_MAX = 280

export const DEFAULT_CG_INSTRUCTIONS =
  'Emphasize what the group already shares, then name remaining concerns in plain language. Keep recommendations concrete and grounded in the votes. Do not flatten minority concerns. Prefer participant wording over abstract jargon when both are available.'
