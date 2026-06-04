import { useMemo } from 'react'
import { computeOpinionClusters } from '../utils/opinion-clusters'

const CLUSTER_COLORS = ['#2a9d4e', '#e0a400', '#3b82f6', '#a855f7']
const GROUP_LETTERS = ['A', 'B', 'C', 'D']

function project(v) {
  return 50 + v * 24
}

function VoteBar({ agree, disagree }) {
  const total = agree + disagree || 1
  return (
    <div className="vote-bar" aria-hidden="true">
      <span className="vote-bar-agree" style={{ width: `${(agree / total) * 100}%` }} />
      <span className="vote-bar-disagree" style={{ width: `${(disagree / total) * 100}%` }} />
    </div>
  )
}

function StatementRow({ s }) {
  return (
    <li className="result-statement" data-testid={`result-statement-${s.id}`}>
      <p className="result-statement-text">
        {s.custom && <span className="card-tag inline">Custom</span>}
        {s.text}
      </p>
      <VoteBar agree={s.agree} disagree={s.disagree} />
      <div className="result-statement-meta">
        <span className="meta-agree">{s.agree} agree</span>
        <span className="meta-disagree">{s.disagree} disagree</span>
      </div>
    </li>
  )
}

function ClusterScatter({ result }) {
  const { points, clusters } = result
  const hulls = clusters.map((cl) => {
    const members = points.filter((p) => p.cluster === cl.id)
    const cx = members.reduce((s, p) => s + p.x, 0) / members.length
    const cy = members.reduce((s, p) => s + p.y, 0) / members.length
    const r = Math.max(
      0.18,
      ...members.map((p) => Math.hypot(p.x - cx, p.y - cy)),
    )
    return { id: cl.id, cx, cy, r }
  })

  return (
    <svg viewBox="0 0 100 100" className="cluster-scatter" data-testid="cluster-scatter">
      {hulls.map((h) => (
        <circle
          key={`hull-${h.id}`}
          cx={project(h.cx)}
          cy={project(h.cy)}
          r={h.r * 24 + 6}
          fill={CLUSTER_COLORS[h.id % CLUSTER_COLORS.length]}
          opacity="0.08"
          stroke={CLUSTER_COLORS[h.id % CLUSTER_COLORS.length]}
          strokeWidth="0.4"
          strokeDasharray="2 2"
          strokeOpacity="0.5"
        />
      ))}
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

export default function ResultsPanel({ statements, results, isHost = false }) {
  const cluster = useMemo(
    () => (results ? computeOpinionClusters(results) : null),
    [results],
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
        ? `Opinion clusters appear once at least 3 people have voted (currently ${cluster.voterCount}).`
        : `At least 2 statements are needed to map opinions (currently ${cluster.statementCount}).`
    return (
      <div className="results-panel">
        <Placeholder title="Opinion Clusters" message={message} />
        {cluster.consensus.length > 0 && (
          <ConsensusBlocks cluster={cluster} />
        )}
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
          {cluster.voterCount} participants grouped into {cluster.k} opinion {cluster.k === 1 ? 'group' : 'groups'} by how they voted.
        </p>
      </div>

      <ClusterScatter result={cluster} />

      <div className="cluster-legend" data-testid="cluster-legend">
        {cluster.clusters.map((c) => (
          <div className="cluster-legend-item" key={c.id}>
            <span className="cluster-dot" style={{ background: CLUSTER_COLORS[c.id % CLUSTER_COLORS.length] }} />
            <span className="cluster-legend-label">Group {GROUP_LETTERS[c.id]}</span>
            <span className="cluster-legend-size">{c.size}</span>
          </div>
        ))}
      </div>

      {!isHost && youLetter && (
        <div className="you-callout" data-testid="you-callout">
          You're in <strong>Group {youLetter}</strong>
          {youSize > 1 ? ` with ${youSize - 1} ${youSize - 1 === 1 ? 'other' : 'others'} who vote like you.` : ' — a unique stance so far.'}
        </div>
      )}

      <ConsensusBlocks cluster={cluster} />
    </div>
  )
}

function ConsensusBlocks({ cluster }) {
  return (
    <>
      {cluster.consensus.length > 0 && (
        <section className="result-section">
          <div className="result-section-head">
            <span className="result-section-title">Common ground</span>
            <span className="result-section-hint">Where most people agree</span>
          </div>
          <ul className="result-statement-list">
            {cluster.consensus.map((s) => <StatementRow key={s.id} s={s} />)}
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
            {cluster.divisive.map((s) => <StatementRow key={s.id} s={s} />)}
          </ul>
        </section>
      )}
    </>
  )
}
