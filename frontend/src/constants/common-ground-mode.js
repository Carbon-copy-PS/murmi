export const CG_MODE_OPTIONS = [
  {
    id: 'generic',
    label: 'Generic',
    hint: 'Shared positions, disagreements, and a bridge',
    recommended: true,
  },
  {
    id: 'policy',
    label: 'Policy',
    hint: 'Working policy proposal with recommendations',
  },
]

export const CG_MODE_LABELS = Object.fromEntries(
  CG_MODE_OPTIONS.map((o) => [o.id, o.label]),
)

export const DEFAULT_CG_MODE = 'generic'

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

/** True when this version should render as a policy proposal. */
export function isPolicyCommonGround(item) {
  if (!item) return false
  const recs = item.recommendations
  if (Array.isArray(recs) && recs.length > 0) return true
  return resolveCgMode(item) === 'policy'
}

export const CG_VOTE_REASON_MAX = 280
