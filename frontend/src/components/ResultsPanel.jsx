import { useMemo, useState } from 'react'
import { computeOpinionClusters } from '../utils/opinion-clusters'
import {
  buildCSV,
  buildJSON,
  buildSummary,
  downloadFile,
  exportFilename,
} from '../utils/export-results'

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

function GroupCard({ group, isYou }) {
  const color = CLUSTER_COLORS[group.id % CLUSTER_COLORS.length]
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

      {group.agree.length === 0 && group.disagree.length === 0 ? (
        <p className="group-card-empty">No strong shared positions yet.</p>
      ) : (
        <>
          {group.agree.length > 0 && (
            <div className="group-stance">
              <span className="group-stance-label agree">Tend to agree</span>
              <ul>
                {group.agree.map((s) => (
                  <li key={s.id} data-testid={`group-${group.id}-agree-${s.id}`}>{s.text}</li>
                ))}
              </ul>
            </div>
          )}
          {group.disagree.length > 0 && (
            <div className="group-stance">
              <span className="group-stance-label disagree">Tend to disagree</span>
              <ul>
                {group.disagree.map((s) => (
                  <li key={s.id} data-testid={`group-${group.id}-disagree-${s.id}`}>{s.text}</li>
                ))}
              </ul>
            </div>
          )}
        </>
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

function CommonGroundSection({ data, pending, error, isHost, payload, onGenerate, onDismiss }) {
  const canGenerate =
    isHost && payload && (payload.consensus.length > 0 || payload.divisive.length > 0)

  if (!isHost && !data && !pending) return null

  return (
    <section className="result-section common-ground" data-testid="common-ground">
      <div className="result-section-head">
        <span className="result-section-title">AI common ground</span>
        {isHost && data && !pending ? (
          <button
            type="button"
            className="cg-close-btn"
            data-testid="cg-close"
            onClick={onDismiss}
            aria-label="Close common ground for everyone"
          >
            Close
          </button>
        ) : (
          <span className="result-section-hint">A statement the room could share</span>
        )}
      </div>

      {pending && (
        <div className="cg-loading" data-testid="cg-loading">
          <span className="cg-spinner" /> Mediator is finding common ground…
        </div>
      )}

      {!pending && error && <p className="cg-error" data-testid="cg-error">{error}</p>}

      {!pending && data && (
        <div className="cg-card" data-testid="cg-card">
          <p className="cg-statement">{data.groupStatement}</p>

          {data.bridgingProposal && (
            <div className="cg-bridge">
              <span className="cg-bridge-label">Bridging proposal</span>
              <p>{data.bridgingProposal}</p>
            </div>
          )}

          <div className="cg-cols">
            {data.commonGround?.length > 0 && (
              <div className="cg-col">
                <span className="cg-col-label agree">Shared ground</span>
                <ul>{data.commonGround.map((t, i) => <li key={`cg-a-${i}`}>{t}</li>)}</ul>
              </div>
            )}
            {data.divides?.length > 0 && (
              <div className="cg-col">
                <span className="cg-col-label disagree">Open tensions</span>
                <ul>{data.divides.map((t, i) => <li key={`cg-d-${i}`}>{t}</li>)}</ul>
              </div>
            )}
          </div>
        </div>
      )}

      {isHost && (
        <button
          type="button"
          className="cg-generate-btn"
          data-testid="cg-generate"
          disabled={!canGenerate || pending}
          onClick={() => onGenerate(payload)}
        >
          {pending ? 'Generating…' : data ? 'Regenerate' : 'Find common ground'}
        </button>
      )}

      {isHost && !canGenerate && !data && (
        <p className="cg-hint">Needs a few votes on at least one statement first.</p>
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
  commonGround = null,
  cgPending = false,
  cgError = null,
  onGenerateCommonGround = () => {},
  onDismissCommonGround = () => {},
}) {
  const cluster = useMemo(
    () => (results ? computeOpinionClusters(results) : null),
    [results],
  )

  const exportCtx = { topic, sessionId, statements, results, cluster, commonGround }

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
      })),
    }
  }, [cluster])

  const commonGroundSection = (
    <CommonGroundSection
      data={commonGround}
      pending={cgPending}
      error={cgError}
      isHost={isHost}
      payload={cgPayload}
      onGenerate={onGenerateCommonGround}
      onDismiss={onDismissCommonGround}
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
        {cluster.consensus.length > 0 && <ConsensusBlocks cluster={cluster} />}
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
            <GroupCard key={g.id} group={g} isYou={g.id === cluster.youCluster} />
          ))}
        </div>
      </section>

      <ConsensusBlocks cluster={cluster} />

      <ExportBar ctx={exportCtx} />
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
