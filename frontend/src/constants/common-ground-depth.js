export const CG_DEPTH_OPTIONS = [
  {
    id: 'basic',
    label: 'Basic',
    hint: 'Quick consensus summary',
    tier: 1,
  },
  {
    id: 'extended',
    label: 'Extended',
    hint: 'More shared ground & tensions',
    tier: 2,
    recommended: true,
  },
  {
    id: 'comprehensive',
    label: 'Comprehensive',
    hint: 'Full group-aware analysis',
    tier: 3,
  },
]

export const CG_DEPTH_LABELS = Object.fromEntries(
  CG_DEPTH_OPTIONS.map((o) => [o.id, o.label]),
)

export const DEFAULT_CG_DEPTH = 'extended'

export const CG_VOTE_REASON_MAX = 280
