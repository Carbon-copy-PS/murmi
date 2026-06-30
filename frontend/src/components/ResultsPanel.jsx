import { useEffect, useMemo, useState } from 'react'
import { CG_DEPTH_LABELS, CG_VOTE_REASON_MAX } from '../constants/common-ground-depth'
import TensionGenerator from './tension-generator'
import { canGenerateTensions } from '../utils/tension-stats'
import { computeOpinionClusters } from '../utils/opinion-clusters'
import {
  buildCSV,
  buildJSON,
  buildSummary,
  downloadFile,
  exportFilename,
  exportPDF,
} from '../utils/export-results'

const CLUSTER_COLORS = ['#2a9d4e', '#e0a400', '#3b82f6', '#a855f7']
const GROUP_LETTERS = ['A', 'B', 'C', 'D']

function project(v) {
  return 50 + v * 24
}

function VoteBar({ agree, disagree, empty = false }) {
  const total = agree + disagree
  if (!total) {
    return (
      <div className={`vote-bar ${empty ? 'vote-bar-empty' : ''}`} aria-hidden="true">
        <span className="vote-bar-agree" style={{ width: '50%' }} />
        <span className="vote-bar-disagree" style={{ width: '50%' }} />
      </div>
    )
  }
  return (
    <div className="vote-bar" aria-hidden="true">
      <span className="vote-bar-agree" style={{ width: `${(agree / total) * 100}%` }} />
      <span className="vote-bar-disagree" style={{ width: `${(disagree / total) * 100}%` }} />
    </div>
  )
}

function CgVoteSummary({ votes, compact = false, testId }) {
  const agree = votes?.agree || 0
  const disagree = votes?.disagree || 0
  const total = agree + disagree
  const agreePct = total ? Math.round((agree / total) * 100) : 0
  const disagreePct = total ? 100 - agreePct : 0

  return (
    <div className={`cg-vote-summary ${compact ? 'compact' : ''}`} data-testid={testId}>
      <VoteBar agree={agree} disagree={disagree} empty={!total} />
      {total > 0 ? (
        compact ? (
          <div className="cg-vote-pcts-compact">
            <span className="meta-agree">{agreePct}% agree</span>
            <span className="meta-disagree">{disagreePct}% disagree</span>
          </div>
        ) : (
          <div className="result-statement-meta">
            <span className="meta-agree">{agreePct}% agree</span>
            <span className="meta-disagree">{disagreePct}% disagree</span>
          </div>
        )
      ) : (
        <span className="cg-vote-summary-empty">No votes yet</span>
      )}
    </div>
  )
}

const LIKERT_SEGMENTS = [
  { key: 'strongly_disagree', cls: 'sd', label: 'Strongly disagree' },
  { key: 'disagree', cls: 'd', label: 'Disagree' },
  { key: 'neutral', cls: 'n', label: 'Neutral' },
  { key: 'agree', cls: 'a', label: 'Agree' },
  { key: 'strongly_agree', cls: 'sa', label: 'Strongly agree' },
]

function LikertBar({ dist, responded }) {
  const total = responded || 1
  return (
    <div className="likert-bar" aria-hidden="true">
      {LIKERT_SEGMENTS.map((seg) => {
        const count = dist?.[seg.key] || 0
        if (!count) return null
        const pct = Math.round((count / total) * 100)
        return (
          <span
            key={seg.key}
            className={`likert-seg ${seg.cls}`}
            style={{ width: `${(count / total) * 100}%` }}
            title={`${seg.label}: ${count} (${pct}%)`}
          >
            {pct >= 12 ? `${count}` : ''}
          </span>
        )
      })}
    </div>
  )
}

function StatementRow({ s, voteType = 'binary' }) {
  const likert = voteType === 'likert'
  return (
    <li className="result-statement" data-testid={`result-statement-${s.id}`}>
      <p className="result-statement-text">
        {s.edited && <span className="card-tag inline edited">Edited</span>}
        {s.custom && <span className="card-tag inline">Custom</span>}
        {s.text}
      </p>
      {likert ? (
        <>
          <LikertBar dist={s.dist} responded={s.responded} />
          <div className="result-statement-meta likert">
            {LIKERT_SEGMENTS.filter((seg) => (s.dist?.[seg.key] || 0) > 0).map((seg) => {
              const count = s.dist?.[seg.key] || 0
              const pct = s.responded ? Math.round((count / s.responded) * 100) : 0
              return (
                <span key={seg.key} className={`meta-likert ${seg.cls}`}>
                  <span className="meta-likert-dot" /> {seg.label} {count} ({pct}%)
                </span>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <VoteBar agree={s.agree} disagree={s.disagree} />
          <div className="result-statement-meta">
            <span className="meta-agree">{s.agree} agree</span>
            <span className="meta-disagree">{s.disagree} disagree</span>
          </div>
        </>
      )}
    </li>
  )
}

function ClusterMap({ result }) {
  const { points, clusters } = result
  const hulls = clusters.map((cl) => {
    const members = points.filter((p) => p.cluster === cl.id)
    const cx = members.reduce((s, p) => s + p.x, 0) / members.length
    const cy = members.reduce((s, p) => s + p.y, 0) / members.length
    const r = Math.max(0.18, ...members.map((p) => Math.hypot(p.x - cx, p.y - cy)))
    return { id: cl.id, cx, cy, r }
  })

  return (
    <div className="cluster-map">
      <svg viewBox="0 0 100 100" className="cluster-scatter" data-testid="cluster-scatter">
        {hulls.map((h) => {
          const color = CLUSTER_COLORS[h.id % CLUSTER_COLORS.length]
          return (
            <g key={`hull-${h.id}`}>
              <circle
                cx={project(h.cx)}
                cy={project(h.cy)}
                r={h.r * 24 + 7}
                fill={color}
                opacity="0.09"
                stroke={color}
                strokeWidth="0.4"
                strokeDasharray="2 2"
                strokeOpacity="0.45"
              />
              <text
                x={project(h.cx)}
                y={project(h.cy) - (h.r * 24 + 9)}
                className="cluster-map-label"
                textAnchor="middle"
                fill={color}
              >
                Group {GROUP_LETTERS[h.id]}
              </text>
            </g>
          )
        })}
        {points.map((p, i) => {
          const color = CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length]
          return p.isYou ? (
            <g key={`pt-${i}`} data-testid="cluster-you">
              <circle cx={project(p.x)} cy={project(p.y)} r="4.4" fill="none" stroke={color} strokeWidth="1.1" />
              <circle cx={project(p.x)} cy={project(p.y)} r="2.6" fill={color} />
              <text x={project(p.x)} y={project(p.y) - 6} className="you-label" textAnchor="middle">You</text>
            </g>
          ) : (
            <circle key={`pt-${i}`} cx={project(p.x)} cy={project(p.y)} r="2.1" fill={color} opacity="0.78" />
          )
        })}
      </svg>
      <p className="cluster-map-caption">
        Each dot is one participant. People who voted alike sit closer together and share a color.
      </p>
    </div>
  )
}

function GroupSizeBars({ clusters, voterCount, youCluster }) {
  return (
    <div className="group-bars" data-testid="group-bars">
      {clusters.map((c) => {
        const pct = Math.round((c.size / voterCount) * 100)
        const color = CLUSTER_COLORS[c.id % CLUSTER_COLORS.length]
        return (
          <div className="group-bar-row" key={c.id}>
            <span className="group-bar-name">
              <span className="cluster-dot" style={{ background: color }} />
              Group {GROUP_LETTERS[c.id]}
              {youCluster === c.id && <span className="you-chip">You</span>}
            </span>
            <div className="group-bar-track">
              <span className="group-bar-fill" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="group-bar-value">{c.size} ({pct}%)</span>
          </div>
        )
      })}
    </div>
  )
}

const GROUP_STANCES = [
  { key: 'stronglyAgree', label: 'Strongly agree on', cls: 'strongly-agree' },
  { key: 'agree', label: 'Agree on', cls: 'agree' },
  { key: 'stronglyDisagree', label: 'Strongly disagree on', cls: 'strongly-disagree' },
  { key: 'disagree', label: 'Disagree on', cls: 'disagree' },
]

function GroupCard({ group, isYou, voteType = 'binary' }) {
  const color = CLUSTER_COLORS[group.id % CLUSTER_COLORS.length]
  const likert = voteType === 'likert'
  const stances = likert
    ? GROUP_STANCES
    : [
        { key: 'agree', label: 'Tend to agree', cls: 'agree' },
        { key: 'disagree', label: 'Tend to disagree', cls: 'disagree' },
      ]
  const hasStances = stances.some((st) => (group[st.key] || []).length > 0)

  return (
    <div className={`group-card ${isYou ? 'you' : ''}`} data-testid={`group-card-${group.id}`}>
      <div className="group-card-head">
        <span className="group-card-badge" style={{ background: color }}>{GROUP_LETTERS[group.id]}</span>
        <div>
          <span className="group-card-title">
            Group {GROUP_LETTERS[group.id]}
            {isYou && <span className="you-chip">You</span>}
          </span>
          <span className="group-card-size">{group.size} {group.size === 1 ? 'person' : 'people'}</span>
        </div>
      </div>

      {!hasStances ? (
        <p className="group-card-empty">No strong shared positions yet.</p>
      ) : (
        stances.map((st) => {
          const items = group[st.key] || []
          if (!items.length) return null
          return (
            <div className="group-stance" key={st.key}>
              <span className={`group-stance-label ${st.cls}`}>{st.label}</span>
              <ul>
                {items.map((s) => (
                  <li key={s.id} data-testid={`group-${group.id}-${st.key}-${s.id}`}>{s.text}</li>
                ))}
              </ul>
            </div>
          )
        })
      )}
    </div>
  )
}

function ExportBar({ ctx }) {
  const [copied, setCopied] = useState(false)
  const hasData = ctx.statements.some((s) => s.approved)
  if (!hasData) return null

  const sid = ctx.sessionId

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(buildSummary(ctx))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="result-section export-bar" data-testid="export-bar">
      <div className="result-section-head">
        <span className="result-section-title">Export results</span>
        <span className="result-section-hint">Download or share this session</span>
      </div>
      <div className="export-actions">
        <button
          className="export-btn"
          onClick={() => exportPDF(ctx, exportFilename(sid, 'pdf'))}
          data-testid="export-pdf"
        >
          PDF
        </button>
        <button
          className="export-btn"
          onClick={() => downloadFile(exportFilename(sid, 'csv'), buildCSV(ctx), 'text/csv')}
          data-testid="export-csv"
        >
          CSV
        </button>
        <button
          className="export-btn"
          onClick={() => downloadFile(exportFilename(sid, 'json'), buildJSON(ctx), 'application/json')}
          data-testid="export-json"
        >
          JSON
        </button>
        <button className="export-btn primary" onClick={copySummary} data-testid="export-summary">
          {copied ? 'Copied ✓' : 'Copy summary'}
        </button>
      </div>
    </section>
  )
}

function Placeholder({ title, message, stats }) {
  return (
    <div className="results-placeholder">
      <svg viewBox="0 0 200 140" className="results-svg">
        <ellipse cx="60" cy="65" rx="45" ry="35" fill="none" stroke="#2a9d4e" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
        <ellipse cx="145" cy="75" rx="40" ry="30" fill="none" stroke="#e00" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
        <circle cx="55" cy="60" r="4" fill="#2a9d4e" opacity="0.7" />
        <circle cx="70" cy="72" r="4" fill="#2a9d4e" opacity="0.6" />
        <circle cx="62" cy="50" r="4" fill="#2a9d4e" opacity="0.8" />
        <circle cx="140" cy="70" r="4" fill="#e00" opacity="0.7" />
        <circle cx="152" cy="80" r="4" fill="#e00" opacity="0.6" />
        <circle cx="100" cy="68" r="4" fill="#999" opacity="0.4" />
      </svg>
      <h3>{title}</h3>
      <p className="results-description">{message}</p>
      {stats && <p className="results-stats">{stats}</p>}
    </div>
  )
}

function formatCgTimestamp(ts) {
  if (!ts) return 'Unknown time'
  return new Date(ts * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatCgRelative(ts) {
  if (!ts) return ''
  const diff = Math.max(0, Date.now() - ts * 1000)
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatCgTimestamp(ts)
}

function CgSharedTensions({ shared = [], tensions = [], id }) {
  if (!shared.length && !tensions.length) return null
  return (
    <div className="cg-split" data-testid="cg-split">
      <div className="cg-split-col agree">
        <span className="cg-split-label">Shared ground</span>
        <ul className="cg-split-list">
          {shared.length ? shared.map((t, i) => (
            <li key={`${id}-s-${i}`} data-testid={`cg-shared-${i}`}>{t}</li>
          )) : <li className="cg-split-empty">—</li>}
        </ul>
      </div>
      <div className="cg-split-col disagree">
        <span className="cg-split-label">Open tensions</span>
        <ul className="cg-split-list">
          {tensions.length ? tensions.map((t, i) => (
            <li key={`${id}-t-${i}`} data-testid={`cg-tension-${i}`}>{t}</li>
          )) : <li className="cg-split-empty">—</li>}
        </ul>
      </div>
    </div>
  )
}

function CgExtrasCollapsible({ data }) {
  const extras = [
    { key: 'alt', title: 'Alternative bridges', items: data.bridgingAlternatives },
    { key: 'insight', title: 'Insights', items: data.insights },
    { key: 'trade', title: 'Trade-offs', items: data.tradeoffs },
  ].filter((e) => e.items?.length)
  const hasGroups = data.groupNotes?.length > 0
  if (!extras.length && !hasGroups) return null

  return (
    <details className="cg-extras-toggle" data-testid="cg-extras-toggle">
      <summary className="cg-extras-summary">More analysis</summary>
      <div className="cg-extras-body">
        {extras.map((e) => (
          <CgExtraList key={e.key} title={e.title} items={e.items} testId={`cg-${e.key}`} />
        ))}
        {hasGroups && (
          <div className="cg-group-notes" data-testid="cg-group-notes">
            <span className="cg-extra-label">Group perspectives</span>
            <ul className="cg-extra-list">
              {data.groupNotes.map((g, i) => (
                <li key={`cg-group-note-${i}`} data-testid={`cg-group-note-${i}`}>
                  <strong>Group {g.group}:</strong> {g.note}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  )
}

function CgVersionPicker({ sorted, selectedId, onSelect }) {
  if (sorted.length <= 1) return null
  return (
    <div className="cg-version-picker" data-testid="cg-history-tabs" role="tablist" aria-label="Common ground versions">
      <div className="cg-version-scroll">
        {sorted.map((item, index) => {
          const isLatest = index === 0
          const versionNum = sorted.length - index
          const isSelected = item.id === selectedId
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`cg-version-chip ${isSelected ? 'on' : ''}`}
              data-testid={`cg-tab-${item.id}`}
              title={formatCgTimestamp(item.generatedAt)}
              onClick={() => onSelect(item.id)}
            >
              <span className="cg-version-chip-top">
                <span className="cg-version-chip-ver">v{versionNum}</span>
                {isLatest && <span className="cg-version-chip-latest">Latest</span>}
                {item.depth && (
                  <span className={`cg-version-chip-depth depth-${item.depth}`}>
                    {CG_DEPTH_LABELS[item.depth]}
                  </span>
                )}
              </span>
              <span className="cg-version-chip-time">{formatCgRelative(item.generatedAt)}</span>
              <CgVoteSummary votes={item.votes} compact testId={`cg-tab-votes-${item.id}`} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CommonGroundVote({ cgId, votes, myVote, myReason, onVote }) {
  const [reason, setReason] = useState(myReason || '')
  const [pendingVote, setPendingVote] = useState(null)
  const activeVote = myVote || pendingVote
  const agree = votes?.agree || 0
  const disagree = votes?.disagree || 0
  const reasonLen = reason.length
  const reasonInvalid = reasonLen > CG_VOTE_REASON_MAX

  useEffect(() => {
    setReason(myReason || '')
  }, [myReason, myVote, cgId])

  useEffect(() => {
    if (myVote) setPendingVote(null)
  }, [myVote])

  function submitVote(vote) {
    const next = myVote === vote ? 'undo' : vote
    const trimmed = reason.trim()
    if (next !== 'undo' && trimmed.length > CG_VOTE_REASON_MAX) return
    setPendingVote(next === 'undo' ? null : next)
    onVote(next, next === 'undo' ? '' : trimmed)
  }

  function saveReason() {
    if (!activeVote || reasonInvalid) return
    onVote(activeVote, reason.trim())
  }

  return (
    <div className="cg-vote" data-testid="cg-vote">
      <div className="cg-vote-head">
        <span className="cg-vote-label">Your reaction</span>
        {activeVote && (
          <span className={`cg-vote-you ${activeVote}`} data-testid="cg-your-vote">
            You {activeVote === 'agree' ? 'agree' : 'disagree'}
          </span>
        )}
      </div>
      <div className="cg-vote-actions">
        <button
          type="button"
          className={`cg-vote-btn agree ${activeVote === 'agree' ? 'on' : ''}`}
          onClick={() => submitVote('agree')}
          aria-pressed={activeVote === 'agree'}
          data-testid="cg-vote-agree"
        >
          👍 Agree <span className="cg-vote-count">{agree}</span>
        </button>
        <button
          type="button"
          className={`cg-vote-btn disagree ${activeVote === 'disagree' ? 'on' : ''}`}
          onClick={() => submitVote('disagree')}
          aria-pressed={activeVote === 'disagree'}
          data-testid="cg-vote-disagree"
        >
          👎 Disagree <span className="cg-vote-count">{disagree}</span>
        </button>
      </div>
      {activeVote && (
        <div className="cg-reason-wrap cg-reason-animate">
          <label className="cg-reason-label" htmlFor={`cg-vote-reason-${cgId}`}>
            Why? <span className="cg-reason-optional">(optional)</span>
          </label>
          <textarea
            id={`cg-vote-reason-${cgId}`}
            className={`cg-reason-input ${reasonInvalid ? 'invalid' : ''}`}
            data-testid="cg-vote-reason"
            value={reason}
            maxLength={CG_VOTE_REASON_MAX}
            rows={2}
            placeholder="Share what resonates or what’s missing…"
            onChange={(e) => setReason(e.target.value)}
            onBlur={saveReason}
          />
          <div className="cg-reason-meta">
            <span className={reasonInvalid ? 'cg-reason-error' : 'cg-reason-count'} data-testid="cg-reason-count">
              {reasonLen}/{CG_VOTE_REASON_MAX}
            </span>
          </div>
        </div>
      )}
      <CgVoteSummary votes={votes} testId="cg-vote-summary" />
    </div>
  )
}

function CommonGroundCard({ data, isHost, onDismiss, onVote, multiVersion = false, versionNum = null }) {
  const depthLabel = data.depth ? CG_DEPTH_LABELS[data.depth] : null

  return (
    <div className="cg-card" data-testid={`cg-card-${data.id}`}>
      <div className="cg-card-toolbar" data-testid="cg-card-toolbar">
        <div className="cg-card-toolbar-meta">
          {multiVersion && versionNum != null && (
            <span className="cg-card-ver" data-testid="cg-card-ver">v{versionNum}</span>
          )}
          <span className="cg-meta-time" data-testid="cg-meta-time">{formatCgTimestamp(data.generatedAt)}</span>
          <span className="cg-meta-relative">{formatCgRelative(data.generatedAt)}</span>
          {depthLabel && <span className={`cg-depth-badge depth-${data.depth}`}>{depthLabel}</span>}
          {data.generatedByName && (
            <span className="cg-meta-host" data-testid="cg-meta-host">· {data.generatedByName}</span>
          )}
          {(data.voterCountAtGeneration != null || data.statementCountAtGeneration != null) && (
            <span className="cg-meta-snapshot" data-testid="cg-meta-snapshot">
              · {data.voterCountAtGeneration != null && `${data.voterCountAtGeneration} voters`}
              {data.voterCountAtGeneration != null && data.statementCountAtGeneration != null && ' · '}
              {data.statementCountAtGeneration != null && `${data.statementCountAtGeneration} stmts`}
            </span>
          )}
        </div>
        {isHost && (
          <button
            type="button"
            className="cg-remove-version-btn"
            data-testid={`cg-remove-${data.id}`}
            onClick={() => onDismiss(data.id)}
            aria-label="Remove this common ground version"
          >
            Remove version
          </button>
        )}
      </div>

      {!multiVersion && (
        <CgVoteSummary votes={data.votes} compact testId={`cg-header-votes-${data.id}`} />
      )}

      <blockquote className="cg-statement" cite={`#cg-card-${data.id}`}>
        {data.groupStatement}
      </blockquote>

      <CgSharedTensions
        id={data.id}
        shared={data.commonGround}
        tensions={data.divides}
      />

      {data.bridgingProposal && (
        <div className="cg-bridge">
          <span className="cg-bridge-label">Bridging proposal</span>
          <p>{data.bridgingProposal}</p>
        </div>
      )}

      <CgExtrasCollapsible data={data} />

      <div className="cg-vote-panel">
        <CommonGroundVote
          cgId={data.id}
          votes={data.votes}
          myVote={data.myVote}
          myReason={data.myReason}
          onVote={(vote, reason) => onVote(data.id, vote, reason)}
        />
      </div>
    </div>
  )
}

function CgExtraList({ title, items, testId }) {
  if (!items?.length) return null
  return (
    <div className="cg-extra" data-testid={testId}>
      <span className="cg-extra-label">{title}</span>
      <ul className="cg-extra-list">
        {items.map((item, i) => (
          <li key={`${testId}-${i}`} data-testid={`${testId}-${i}`}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function CommonGroundSection({
  history,
  pending,
  pendingDepth,
  error,
  isHost,
  payload,
  defaultDepth = 'extended',
  onGenerate,
  onDismiss,
  onVote,
  statements = [],
  tensionsPending = false,
  tensionsError = null,
  tensionDrafts = null,
  onGenerateTensions,
  onPublishTensions,
  onClearTensionDrafts,
}) {
  const canGenerate =
    isHost && payload && (payload.consensus.length > 0 || payload.divisive.length > 0)
  const depthLabel = pending && pendingDepth ? CG_DEPTH_LABELS[pendingDepth] : null
  const defaultDepthLabel = CG_DEPTH_LABELS[defaultDepth] || 'Extended'
  const sorted = useMemo(
    () => [...(history || [])].sort((a, b) => (b.generatedAt || 0) - (a.generatedAt || 0)),
    [history],
  )
  const [selectedId, setSelectedId] = useState(null)
  const selected = sorted.find((item) => item.id === selectedId) || sorted[0] || null
  const multiVersion = sorted.length > 1

  useEffect(() => {
    if (!sorted.length) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !sorted.some((item) => item.id === selectedId)) {
      setSelectedId(sorted[0].id)
    }
  }, [sorted, selectedId])

  if (!isHost && !sorted.length && !pending) return null

  return (
    <section className="result-section common-ground" data-testid="common-ground">
      <div className="result-section-head cg-section-head">
        <div className="cg-section-title-wrap">
          <span className="result-section-title">AI common ground</span>
          <span className="result-section-hint">
            {multiVersion
              ? `${sorted.length} versions — pick one to compare room sentiment`
              : 'Synthesized from votes — refine as the discussion evolves'}
          </span>
        </div>
        {isHost && sorted.length > 0 && (
          <button
            type="button"
            className="cg-new-version-btn"
            data-testid="cg-generate"
            disabled={!canGenerate || pending}
            onClick={() => onGenerate(payload, defaultDepth)}
            title={`Generate a ${defaultDepthLabel} version — change depth in Settings`}
          >
            + New version
          </button>
        )}
      </div>

      {pending && (
        <div className="cg-loading" data-testid="cg-loading">
          <div className="cg-loading-row">
            <span className="cg-spinner" />
            <div className="cg-loading-copy">
              <strong>{depthLabel ? `${depthLabel} analysis` : 'Finding common ground'}</strong>
              <span>Reading votes and prior feedback…</span>
            </div>
          </div>
          <div className="cg-skeleton" aria-hidden="true">
            <span /><span /><span />
          </div>
        </div>
      )}

      {!pending && error && <p className="cg-error" data-testid="cg-error">{error}</p>}

      {!pending && !sorted.length && isHost && (
        <div className="cg-empty" data-testid="cg-empty">
          <span className="cg-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
              <circle cx="12" cy="12" r="3.2" />
            </svg>
          </span>
          <div className="cg-empty-copy">
            <p className="cg-empty-title">No common ground yet</p>
            <p className="cg-empty-sub">Generate a synthesis once the room has voted on a few statements.</p>
          </div>
          <button
            type="button"
            className="cg-generate-cta"
            data-testid="cg-generate"
            disabled={!canGenerate || pending}
            onClick={() => onGenerate(payload, defaultDepth)}
            title={`Generate a ${defaultDepthLabel} version — change depth in Settings`}
          >
            Generate common ground
          </button>
          <span className="cg-depth-note" data-testid="cg-depth-note">
            {defaultDepthLabel} depth · <span className="cg-depth-note-link">change in Settings</span>
          </span>
          {!canGenerate && (
            <p className="cg-hint">Needs votes on at least one statement before generating.</p>
          )}
        </div>
      )}

      <CgVersionPicker sorted={sorted} selectedId={selected?.id} onSelect={setSelectedId} />

      {!pending && selected && (
        <CommonGroundCard
          data={selected}
          isHost={isHost}
          multiVersion={multiVersion}
          versionNum={multiVersion ? sorted.length - sorted.findIndex((i) => i.id === selected.id) : null}
          onDismiss={onDismiss}
          onVote={onVote}
        />
      )}

      {isHost && onGenerateTensions && canGenerateTensions(statements) && (
        <div className="cg-tensions" data-testid="cg-tensions">
          <div className="section-divider"><span>Surface open tensions</span></div>
          <TensionGenerator
            statements={statements}
            pending={tensionsPending}
            error={tensionsError}
            drafts={tensionDrafts}
            onGenerate={onGenerateTensions}
            onPublish={onPublishTensions}
            onClearDrafts={onClearTensionDrafts}
          />
        </div>
      )}
    </section>
  )
}

export default function ResultsPanel({
  statements,
  results,
  isHost = false,
  topic = null,
  sessionId = null,
  voteType = 'binary',
  commonGroundHistory = [],
  cgPending = false,
  cgPendingDepth = null,
  cgError = null,
  defaultDepth = 'extended',
  onGenerateCommonGround = () => {},
  onDismissCommonGround = () => {},
  onVoteCommonGround = () => {},
  tensionsPending = false,
  tensionsError = null,
  tensionDrafts = null,
  onGenerateTensions,
  onPublishTensions,
  onClearTensionDrafts,
}) {
  const cluster = useMemo(
    () => (results ? computeOpinionClusters({ ...results, voteType }) : null),
    [results, voteType],
  )

  const exportCtx = {
    topic,
    sessionId,
    statements,
    results,
    cluster,
    commonGroundHistory,
    voteType,
  }

  const cgPayload = useMemo(() => {
    if (!cluster) return null
    return {
      voterCount: cluster.voterCount,
      statementCount: cluster.statementCount,
      consensus: cluster.consensus.map((s) => ({ text: s.text, agree: s.agree, disagree: s.disagree })),
      divisive: cluster.divisive.map((s) => ({ text: s.text, agree: s.agree, disagree: s.disagree })),
      groups: (cluster.groups || []).map((g) => ({
        letter: GROUP_LETTERS[g.id],
        size: g.size,
        agree: g.agree.map((s) => s.text),
        disagree: g.disagree.map((s) => s.text),
        stronglyAgree: (g.stronglyAgree || []).map((s) => s.text),
        stronglyDisagree: (g.stronglyDisagree || []).map((s) => s.text),
      })),
    }
  }, [cluster])

  const commonGroundSection = (
    <CommonGroundSection
      history={commonGroundHistory}
      pending={cgPending}
      pendingDepth={cgPendingDepth}
      error={cgError}
      isHost={isHost}
      payload={cgPayload}
      defaultDepth={defaultDepth}
      onGenerate={onGenerateCommonGround}
      onDismiss={onDismissCommonGround}
      onVote={onVoteCommonGround}
      statements={statements}
      tensionsPending={tensionsPending}
      tensionsError={tensionsError}
      tensionDrafts={tensionDrafts}
      onGenerateTensions={onGenerateTensions}
      onPublishTensions={onPublishTensions}
      onClearTensionDrafts={onClearTensionDrafts}
    />
  )

  const approvedCount = statements.filter((s) => s.approved).length

  if (!cluster) {
    return (
      <div className="results-panel">
        <Placeholder
          title="Opinion Clusters"
          message="Crunching the votes…"
          stats={`${approvedCount} statement${approvedCount !== 1 ? 's' : ''} live`}
        />
      </div>
    )
  }

  if (!cluster.ok) {
    const message =
      cluster.reason === 'need-voters'
        ? `Opinion groups appear once at least 3 people have voted (currently ${cluster.voterCount}).`
        : `At least 2 statements are needed to map opinions (currently ${cluster.statementCount}).`
    return (
      <div className="results-panel">
        <Placeholder title="Opinion Clusters" message={message} />
        {commonGroundSection}
        {cluster.consensus.length > 0 && <ConsensusBlocks cluster={cluster} voteType={voteType} />}
        <ExportBar ctx={exportCtx} />
      </div>
    )
  }

  const youLetter = cluster.youCluster != null ? GROUP_LETTERS[cluster.youCluster] : null
  const youSize = cluster.clusters.find((c) => c.id === cluster.youCluster)?.size ?? 0

  return (
    <div className="results-panel" data-testid="results-panel">
      <div className="results-head">
        <h3 className="results-title">Opinion Clusters</h3>
        <p className="results-sub">
          {cluster.voterCount} participants split into {cluster.k} opinion {cluster.k === 1 ? 'group' : 'groups'} based on how they voted.
        </p>
      </div>

      {!isHost && youLetter && (
        <div className="you-callout" data-testid="you-callout">
          You're in <strong>Group {youLetter}</strong>
          {youSize > 1 ? ` with ${youSize - 1} ${youSize - 1 === 1 ? 'other' : 'others'} who vote like you.` : ' — a unique stance so far.'}
        </div>
      )}

      {commonGroundSection}

      <GroupSizeBars clusters={cluster.clusters} voterCount={cluster.voterCount} youCluster={cluster.youCluster} />

      <ClusterMap result={cluster} />

      <section className="result-section">
        <div className="result-section-head">
          <span className="result-section-title">What each group thinks</span>
          <span className="result-section-hint">Positions that define the group</span>
        </div>
        <div className="group-card-grid">
          {cluster.groups.map((g) => (
            <GroupCard key={g.id} group={g} isYou={g.id === cluster.youCluster} voteType={voteType} />
          ))}
        </div>
      </section>

      <ConsensusBlocks cluster={cluster} voteType={voteType} />

      <ExportBar ctx={exportCtx} />
    </div>
  )
}

function ConsensusBlocks({ cluster, voteType = 'binary' }) {
  return (
    <>
      {cluster.consensus.length > 0 && (
        <section className="result-section">
          <div className="result-section-head">
            <span className="result-section-title">Common ground</span>
            <span className="result-section-hint">Where most people agree</span>
          </div>
          <ul className="result-statement-list">
            {cluster.consensus.map((s) => <StatementRow key={s.id} s={s} voteType={voteType} />)}
          </ul>
        </section>
      )}

      {cluster.divisive.length > 0 && (
        <section className="result-section">
          <div className="result-section-head">
            <span className="result-section-title">Most divisive</span>
            <span className="result-section-hint">Where opinions split</span>
          </div>
          <ul className="result-statement-list">
            {cluster.divisive.map((s) => <StatementRow key={s.id} s={s} voteType={voteType} />)}
          </ul>
        </section>
      )}
    </>
  )
}
