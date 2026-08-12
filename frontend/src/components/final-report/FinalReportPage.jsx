import { getReportCopy } from './report-copy'
import './final-report.css'

function percent(value, language) {
  return new Intl.NumberFormat(language, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function widthPercent(value) {
  return `${Math.max(0, Math.min(1, value || 0)) * 100}%`
}

function dateTime(value, language) {
  if (!value) return ''
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value * 1000))
}

function EvidenceBar({ result, copy, language }) {
  return (
    <div className="story-evidence" aria-label={`${percent(result.supportRate, language)} ${copy.support}`}>
      <div className="story-evidence-track">
        <span style={{ width: widthPercent(result.supportRate) }} />
      </div>
      <div className="story-evidence-meta">
        <strong>{percent(result.supportRate, language)} {copy.support}</strong>
        <span>{percent(result.coverageRate, language)} {copy.coverage}</span>
      </div>
    </div>
  )
}

function responseRate(value, total) {
  return total ? value / total : 0
}

function neutralRate(result) {
  return result.neutralRate ?? responseRate(result.neutral, result.responded)
}

function ResponseDistribution({ result, copy, language }) {
  const responded = result.responded ?? result.responses ?? 0
  const counts = result.counts || {}
  const hasFivePointScale = Object.prototype.hasOwnProperty.call(
    counts,
    'strongly_agree',
  )
  const fivePointParts = [
    ['strong-support', counts.strongly_agree, copy.stronglyAgree],
    ['support', counts.agree, copy.agree],
    ['neutral', counts.neutral, copy.neutral],
    ['oppose', counts.disagree, copy.disagree],
    ['strong-oppose', counts.strongly_disagree, copy.stronglyDisagree],
  ].map(([className, count, label]) => ({
    className,
    count: Number(count) || 0,
    label,
    share: responseRate(Number(count) || 0, responded),
  }))
  const supportShare = result.supportRate ?? responseRate(result.support, responded)
  const neutralShare = result.neutralRate ?? responseRate(result.neutral, responded)
  const opposeShare = result.opposeRate ?? responseRate(result.oppose, responded)
  const aggregateParts = [
    { className: 'support', label: copy.support, share: supportShare },
    { className: 'neutral', label: copy.neutral, share: neutralShare },
    { className: 'oppose', label: copy.oppose, share: opposeShare },
  ]
  const parts = hasFivePointScale ? fivePointParts : aggregateParts
  const label = parts.map((part) => (
    `${percent(part.share, language)} ${part.label}`
  )).join(', ')

  return (
    <div className="story-distribution" aria-label={label}>
      <div className="story-distribution-track" aria-hidden="true">
        {parts.map((part) => (
          <span
            className={part.className}
            key={part.className}
            style={{ width: widthPercent(part.share) }}
          />
        ))}
      </div>
      <div className="story-distribution-meta">
        {parts.map((part) => (
          <span key={part.className}>
            <i className={part.className} />
            {part.label} {percent(part.share, language)}
          </span>
        ))}
        <span>{responded} {copy.responses}</span>
      </div>
    </div>
  )
}

function CoverageOverview({ results, summary, voterCount, copy, language }) {
  const lowIds = new Set(summary?.lowCoverageStatementIds || [])
  const segments = summary?.segments || []
  return (
    <div className="story-coverage">
      <dl className="story-coverage-stats">
        <div>
          <dt>{percent(summary?.averageRate || 0, language)}</dt>
          <dd>{copy.averageCoverage}</dd>
        </div>
        <div>
          <dt>{percent(summary?.lowestRate || 0, language)}</dt>
          <dd>{copy.lowestCoverage}</dd>
        </div>
        <div>
          <dt>{lowIds.size}</dt>
          <dd>{copy.lowerReachStatements}</dd>
        </div>
      </dl>
      {segments.length > 0 && (
        <div className="story-coverage-segments">
          {segments.map((segment, index) => (
            <div key={segment.segment}>
              <span>{copy.coverageSegmentLabels[index]}</span>
              <strong>{Number(segment.averageResponses || 0).toFixed(1)} {copy.responses}</strong>
              <small>
                {copy.statements} {segment.startStatement}–{segment.endStatement}
              </small>
            </div>
          ))}
        </div>
      )}
      <div className="story-coverage-trend-head">
        <p>{copy.coverageChartHint}</p>
        <div className="story-coverage-trend-legend" aria-hidden="true">
          <span><i className="support" />{copy.support}</span>
          <span><i className="neutral" />{copy.neutral}</span>
          <span><i className="oppose" />{copy.oppose}</span>
        </div>
      </div>
      <div
        className="story-coverage-trend"
        role="img"
        aria-label={copy.coverageTrendAria}
      >
        {results.map((result, index) => {
          const supportShare = result.supportRate
            ?? responseRate(result.support, result.responded)
          const neutralShare = result.neutralRate
            ?? responseRate(result.neutral, result.responded)
          const opposeShare = result.opposeRate
            ?? responseRate(result.oppose, result.responded)
          const title = [
            `${index + 1}. ${result.responded}/${voterCount} ${copy.responses}`,
            `${percent(supportShare, language)} ${copy.support}`,
            `${percent(neutralShare, language)} ${copy.neutral}`,
            `${percent(opposeShare, language)} ${copy.oppose}`,
          ].join(' · ')
          return (
            <i
              key={result.id}
              className={lowIds.has(result.id) ? 'is-lower-reach' : ''}
              style={{ height: widthPercent(result.coverageRate) }}
              title={title}
            >
              <span className="support" style={{ height: widthPercent(supportShare) }} />
              <span className="neutral" style={{ height: widthPercent(neutralShare) }} />
              <span className="oppose" style={{ height: widthPercent(opposeShare) }} />
            </i>
          )
        })}
      </div>
      <div className="story-coverage-axis">
        <span>1</span>
        <span>{results.length}</span>
      </div>
    </div>
  )
}

function AllStatementsTable({ results, voterCount, copy, language }) {
  if (!results.length) return null
  return (
    <details className="story-all-statements">
      <summary>{copy.allStatementsTitle(results.length)}</summary>
      <div>
        <p>{copy.allStatementsIntro}</p>
        <div className="story-table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{copy.statement}</th>
                <th>{copy.responses}</th>
                <th>{copy.coverage}</th>
                <th>{copy.support}</th>
                <th>{copy.neutral}</th>
                <th>{copy.oppose}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result, index) => (
                <tr key={result.id}>
                  <td>{index + 1}</td>
                  <td>{result.text}</td>
                  <td>{result.responded}/{voterCount}</td>
                  <td>{percent(result.coverageRate, language)}</td>
                  <td>{result.support} ({percent(result.supportRate, language)})</td>
                  <td>{result.neutral} ({percent(neutralRate(result), language)})</td>
                  <td>{result.oppose} ({percent(
                    result.opposeRate ?? responseRate(result.oppose, result.responded),
                    language,
                  )})</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  )
}

function VennFigure({ overlap, statements, copy, language }) {
  const left = statements.get(overlap.leftStatementId)
  const right = statements.get(overlap.rightStatementId)
  if (!left || !right) return null

  return (
    <figure className="story-venn">
      {overlap.title && <h3>{overlap.title}</h3>}
      <div className="story-venn-labels">
        <p><span>A</span>{left.text}</p>
        <p><span>B</span>{right.text}</p>
      </div>
      <div className="story-venn-circles" aria-hidden="true">
        <div className="story-venn-circle left">
          <strong>{overlap.leftOnly}</strong>
          <span>{copy.leftOnly}</span>
        </div>
        <div className="story-venn-overlap">
          <strong>{overlap.both}</strong>
          <span>{copy.both}</span>
        </div>
        <div className="story-venn-circle right">
          <strong>{overlap.rightOnly}</strong>
          <span>{copy.rightOnly}</span>
        </div>
      </div>
      <figcaption>
        <strong>{percent(overlap.bothRate, language)} {copy.supportedBoth}</strong>
        <span>{overlap.jointResponses} {copy.jointResponses}</span>
        {overlap.explanation && <p>{overlap.explanation}</p>}
      </figcaption>
    </figure>
  )
}

const TENDENCY_COLORS = ['#1f6b4f', '#a16b2e', '#5f5a9c']

function wrapMapLabel(value, maximumCharacters = 20) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines = []
  for (const word of words) {
    const current = lines[lines.length - 1]
    if (!current || `${current} ${word}`.length > maximumCharacters) {
      lines.push(word)
    } else {
      lines[lines.length - 1] = `${current} ${word}`
    }
  }
  if (lines.length <= 2) return lines
  return [lines[0], `${lines.slice(1).join(' ').slice(0, maximumCharacters - 1).trim()}…`]
}

function allocateTendencyCounts(profiles, total) {
  const target = Math.max(0, Math.round(total || 0))
  const masses = profiles.map((profile) => Math.max(0, Number(profile.membershipMass) || 0))
  const massTotal = masses.reduce((sum, mass) => sum + mass, 0)
  if (target === 0 || massTotal === 0) {
    return new Map(profiles.map((profile) => [profile.tendencyId, 0]))
  }
  const apportioned = masses.map((mass) => mass / massTotal * target)
  const counts = apportioned.map(Math.floor)
  const remainderOrder = apportioned
    .map((value, index) => ({ index, remainder: value - counts[index] }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index)
  let remaining = target - counts.reduce((sum, count) => sum + count, 0)
  for (const item of remainderOrder) {
    if (remaining <= 0) break
    counts[item.index] += 1
    remaining -= 1
  }
  return new Map(profiles.map((profile, index) => [profile.tendencyId, counts[index]]))
}

function OpinionLandscape({ landscape, narrative, copy }) {
  if (!landscape?.available) {
    const message = landscape?.reason === 'privacy-threshold'
      ? copy.opinionNeedsRegeneration
      : copy.opinionUnavailable
    return <p className="story-opinion-unavailable">{message}</p>
  }
  const profiles = landscape.tendencies?.profiles || []
  const tendencyNarrative = new Map(
    (narrative?.tendencies || []).map((item) => [item.tendencyId, item]),
  )
  const dimensions = narrative?.dimensions || []
  const horizontalDimension = dimensions.find((dimension) => dimension.axis === 1)
  const verticalDimension = dimensions.find((dimension) => dimension.axis === 2)
  const width = 640
  const height = 410
  const insetX = 44
  const insetY = 34
  const plotWidth = width - insetX * 2
  const plotHeight = height - insetY * 2
  const tendencyCounts = allocateTendencyCounts(
    profiles,
    landscape.eligibleParticipants || 0,
  )
  const peopleLabel = (profile) => copy.opinionMapPeople({
    count: tendencyCounts.get(profile.tendencyId) || 0,
    total: landscape.eligibleParticipants || 0,
  })
  const mapProfiles = profiles.map((profile, index) => {
    const editorial = tendencyNarrative.get(profile.tendencyId)
    const fallbackRadius = 0.08 + 0.1 * Math.sqrt(profile.membershipShare || 0)
    return {
      ...profile,
      color: TENDENCY_COLORS[index % TENDENCY_COLORS.length],
      letter: String.fromCharCode(65 + index),
      labelLines: wrapMapLabel(editorial?.title || copy.tendency),
      peopleLabel: peopleLabel(profile),
      x: insetX + profile.position.x * plotWidth,
      y: insetY + profile.position.y * plotHeight,
      radiusX: (profile.shape?.radiusMajor || fallbackRadius) * plotWidth,
      radiusY: (profile.shape?.radiusMinor || fallbackRadius) * plotHeight,
      rotation: profile.shape?.rotation || 0,
    }
  })

  return (
    <div className="story-opinion">
      <div className="story-opinion-reading">
        <figure className="story-opinion-map">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={copy.opinionTitle}
          >
            <line x1={insetX} y1={height / 2} x2={width - insetX} y2={height / 2} />
            <line x1={width / 2} y1={insetY} x2={width / 2} y2={height - insetY} />
            {mapProfiles.map((profile) => (
              <g className="story-opinion-tendency" key={`shape-${profile.tendencyId}`}>
                <ellipse
                  cx={profile.x}
                  cy={profile.y}
                  rx={profile.radiusX}
                  ry={profile.radiusY}
                  transform={`rotate(${profile.rotation} ${profile.x} ${profile.y})`}
                  style={{ '--tendency-color': profile.color }}
                />
              </g>
            ))}
            {mapProfiles.map((profile) => (
              <g className="story-opinion-tendency" key={`label-${profile.tendencyId}`}>
                <text className="story-opinion-marker-letter" x={profile.x} y={profile.y - 16}>
                  {profile.letter}
                </text>
                <text className="story-opinion-marker-label" x={profile.x} y={profile.y + 5}>
                  {profile.labelLines.map((line, lineIndex) => (
                    <tspan
                      key={`${line}-${lineIndex}`}
                      x={profile.x}
                      dy={lineIndex === 0 ? 0 : 17}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
                <text
                  className="story-opinion-marker-count"
                  x={profile.x}
                  y={profile.y + 23 + (profile.labelLines.length - 1) * 17}
                >
                  {profile.peopleLabel}
                </text>
              </g>
            ))}
            {horizontalDimension && (
              <>
                <text className="story-opinion-axis-label left" x={insetX} y={height - 8}>
                  {horizontalDimension.negativeLabel}
                </text>
                <text
                  className="story-opinion-axis-label right"
                  x={width - insetX}
                  y={height - 8}
                >
                  {horizontalDimension.positiveLabel}
                </text>
              </>
            )}
            {verticalDimension && (
              <>
                <text
                  className="story-opinion-axis-label vertical"
                  x={insetX + 8}
                  y={insetY + 16}
                >
                  {verticalDimension.positiveLabel}
                </text>
                <text
                  className="story-opinion-axis-label vertical"
                  x={insetX + 8}
                  y={height - insetY - 8}
                >
                  {verticalDimension.negativeLabel}
                </text>
              </>
            )}
          </svg>
          <figcaption>
            <span>{landscape.eligibleParticipants || 0} {copy.eligibleParticipants}</span>
            <span>{landscape.excludedParticipants || 0} {copy.excludedParticipants}</span>
          </figcaption>
        </figure>

        <aside className="story-opinion-interpretation">
          <p className="story-kicker">{copy.opinionReadingKicker}</p>
          <h3>{copy.opinionReadingTitle}</h3>
          <p className="story-opinion-interpretation-intro">
            {copy.opinionReadingIntro}
          </p>
          <div className="story-opinion-interpretation-tendencies">
            <strong>{copy.opinionTendenciesLabel}</strong>
            {profiles.map((profile, index) => {
              const editorial = tendencyNarrative.get(profile.tendencyId)
              return (
                <div key={profile.tendencyId}>
                  <span style={{ background: TENDENCY_COLORS[index % TENDENCY_COLORS.length] }}>
                    {String.fromCharCode(65 + index)}
                  </span>
                  <div className="story-opinion-tendency-summary">
                    <h4>
                      {editorial?.title || `${copy.tendency} ${String.fromCharCode(65 + index)}`}
                      <small>{peopleLabel(profile)}</small>
                    </h4>
                    <p>{editorial?.description || copy.opinionTendencyFallback}</p>
                  </div>
                </div>
              )
            })}
          </div>
          {dimensions.length > 0 && (
            <div className="story-opinion-interpretation-dimensions">
              <strong>{copy.opinionDimensionsLabel}</strong>
              <ul>
                {dimensions.map((dimension) => (
                  <li key={dimension.axis}>
                    <span>{dimension.axis}</span>
                    <p>
                      <b>{dimension.label}</b>
                      {dimension.explanation}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="story-opinion-interpretation-caveat">
            {copy.opinionReadingCaveat}
          </p>
        </aside>
      </div>

    </div>
  )
}

function NarrativeEvidence({ item, statements, copy, language, showBar = true }) {
  const evidence = (item.evidenceStatementIds || [])
    .map((id) => statements.get(id))
    .filter(Boolean)
  const primary = evidence[0]

  return (
    <>
      <p className="story-narrative-explanation">{item.explanation}</p>
      {primary && (
        <div className="story-evidence-source">
          <p><span>{copy.evidenceLabel}</span>{primary.text}</p>
          {showBar && <EvidenceBar result={primary} copy={copy} language={language} />}
          {evidence.length > 1 && (
            <small>{copy.moreEvidence(evidence.length - 1)}</small>
          )}
        </div>
      )}
    </>
  )
}

function commonGroundItemText(item) {
  if (typeof item === 'string') return item
  return item?.text || ''
}

function CommonGroundItems({ title, items, className = '' }) {
  const visibleItems = (items || []).filter((item) => commonGroundItemText(item))
  if (visibleItems.length === 0) return null
  return (
    <section className={`story-proposal-list ${className}`.trim()}>
      <h3>{title}</h3>
      <ul>
        {visibleItems.map((item, index) => (
          <li key={item?.id || `${title}-${index}`}>{commonGroundItemText(item)}</li>
        ))}
      </ul>
    </section>
  )
}

function CommonGroundProposal({ proposal, meta, copy, language }) {
  if (!proposal?.groupStatement) return null
  const endorsed = proposal.status === 'endorsed' && Boolean(proposal.endorsement)
  const validation = endorsed ? proposal.endorsement : (proposal.votes || {})
  const agree = Number(validation.agree) || 0
  const disagree = Number(validation.disagree) || 0
  const total = Number(validation.respondentCount ?? validation.total) || agree + disagree
  const rosterSize = Number(validation.rosterSize) || Number(meta.participantCount) || 0
  const agreementRate = total > 0 ? agree / total : 0
  const participationRate = rosterSize > 0 ? Math.min(total / rosterSize, 1) : 0
  const agreementText = total > 0
    ? copy.proposalAgreement({ agree, total, rate: percent(agreementRate, language) })
    : ''
  const participationText = rosterSize > 0
    ? copy.proposalParticipation({ total, rosterSize })
    : ''
  const concerns = (proposal.endorsement?.remainingConcerns || [])
    .map((item) => item?.reason?.trim())
    .filter(Boolean)
  const hasTradeoffs = (proposal.tradeoffs || []).some((item) => commonGroundItemText(item))

  return (
    <StorySection
      kicker={endorsed ? copy.proposalVerifiedKicker : copy.proposalDraftKicker}
      title={copy.proposalSectionTitle}
      className={`story-proposal-section ${endorsed ? 'is-endorsed' : 'is-draft'}`}
    >
      <div className="story-proposal-body">
        {total > 0 ? (
          <div className="story-proposal-metrics">
            <div className="story-proposal-metric">
              <div className="story-proposal-metric-head">
                <span>{copy.proposalAgreementMetric}</span>
                <strong>{percent(agreementRate, language)}</strong>
              </div>
              <div
                className="story-proposal-bar is-agreement"
                role="img"
                aria-label={agreementText}
              >
                <span style={{ width: `${agreementRate * 100}%` }} />
              </div>
              <small>{agreementText}</small>
            </div>
            {rosterSize > 0 && (
              <div className="story-proposal-metric">
                <div className="story-proposal-metric-head">
                  <span>{copy.proposalParticipationMetric}</span>
                  <strong>{percent(participationRate, language)}</strong>
                </div>
                <div
                  className="story-proposal-bar is-participation"
                  role="img"
                  aria-label={participationText}
                >
                  <span style={{ width: `${participationRate * 100}%` }} />
                </div>
                <small>{participationText}</small>
              </div>
            )}
          </div>
        ) : (
          <p className="story-proposal-unvalidated">{copy.proposalUnvalidated}</p>
        )}
        <blockquote>{proposal.groupStatement}</blockquote>
        <div className="story-proposal-package">
          <CommonGroundItems
            title={copy.proposalRecommendations}
            items={proposal.recommendations}
          />
          <CommonGroundItems
            title={copy.proposalConditions}
            items={proposal.essentialConditions}
          />
          <CommonGroundItems
            title={copy.proposalUnresolved}
            items={proposal.unresolvedQuestions}
          />
        </div>
        {hasTradeoffs && (
          <details className="story-proposal-tradeoffs">
            <summary>{copy.proposalTradeoffs}</summary>
            <CommonGroundItems
              title={copy.proposalTradeoffs}
              items={proposal.tradeoffs}
            />
          </details>
        )}
        {concerns.length > 0 && (
          <aside className="story-proposal-concerns">
            <h3>{copy.proposalRemainingConcerns}</h3>
            <ul>
              {concerns.map((reason, index) => (
                <li key={`${reason}-${index}`}>{reason}</li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </StorySection>
  )
}

function ReportStats({ meta, copy }) {
  return (
    <dl className="story-stats">
      <div><dt>{meta.voterCount || 0}</dt><dd>{copy.voters}</dd></div>
      <div><dt>{meta.statementCount || 0}</dt><dd>{copy.statements}</dd></div>
      <div><dt>{meta.responseCount || 0}</dt><dd>{copy.responses}</dd></div>
    </dl>
  )
}

function StorySection({ kicker, title, lead, children, className = '' }) {
  return (
    <section className={`story-section ${className}`}>
      <header className="story-section-head">
        <p className="story-kicker">{kicker}</p>
        <h2>{title}</h2>
        {lead && <p className="story-lead">{lead}</p>}
      </header>
      {children}
    </section>
  )
}

export default function FinalReportPage({ report, preview = false }) {
  if (!report) return null
  const language = report.sourceLanguage || 'en'
  const copy = getReportCopy(language)
  const meta = report.meta || {}
  const results = report.evidence?.statements || []
  const analysis = report.analysis || {}
  const statements = new Map(results.map((result) => [result.id, result]))
  const fallbackTakeaways = (report.story?.takeawayStatementIds || [])
    .map((id) => statements.get(id))
    .filter(Boolean)
  const fallbackCommonGround = (report.story?.commonGroundStatementIds || [])
    .map((id) => statements.get(id))
    .filter(Boolean)
  const coverageSummary = analysis.responseCoverage || {
    averageRate: meta.responseCoverageRate || 0,
    medianRate: 0,
    highestRate: Math.max(0, ...results.map((result) => result.coverageRate || 0)),
    lowestRate: results.length
      ? Math.min(...results.map((result) => result.coverageRate || 0))
      : 0,
    lowCoverageStatementIds: results
      .filter((result) => (result.coverageRate || 0) < 0.5)
      .map((result) => result.id),
  }
  const voteDistribution = analysis.voteDistribution || {
    support: results.reduce((total, result) => total + (result.support || 0), 0),
    neutral: results.reduce((total, result) => total + (result.neutral || 0), 0),
    oppose: results.reduce((total, result) => total + (result.oppose || 0), 0),
    responses: results.reduce((total, result) => total + (result.responded || 0), 0),
  }
  const openQuestions = (report.story?.openQuestionStatementIds || [])
    .map((id) => statements.get(id))
    .filter(Boolean)
  const overlaps = report.story?.overlaps || []
  const proposal = report.commonGroundProposal
  const narrative = report.narrative?.[language] || null
  const keyStatementIds = (
    narrative?.keyStatementIds
    || report.story?.keyStatementIds
    || []
  )
  const keyStatements = (
    keyStatementIds.length > 0
      ? keyStatementIds.map((id) => statements.get(id)).filter(Boolean)
      : fallbackCommonGround
  )
  const narrativeTakeaways = (narrative?.takeaways || []).filter(
    (item) => (item.evidenceStatementIds || []).some((id) => statements.has(id)),
  )
  const principles = (narrative?.principles || []).filter(
    (item) => (item.evidenceStatementIds || []).some((id) => statements.has(id)),
  )
  const actionAreas = (narrative?.actionAreas || []).filter(
    (item) => (item.evidenceStatementIds || []).some((id) => statements.has(id)),
  )
  const narrativeQuestions = (narrative?.openQuestions || []).filter(
    (item) => (item.evidenceStatementIds || []).some((id) => statements.has(id)),
  )
  const implications = (narrative?.implications || []).filter(
    (item) => (item.evidenceStatementIds || []).some((id) => statements.has(id)),
  )
  const takeaways = narrativeTakeaways.length > 0
    ? narrativeTakeaways
    : fallbackTakeaways
  const landscape = report.opinionLandscape || {}
  const variance = (landscape.explainedVariance || [])
    .reduce((total, value) => total + (value || 0), 0)
  const methodSteps = copy.methodSteps({
    voterCount: meta.voterCount || 0,
    statementCount: meta.statementCount || results.length,
    responseCount: meta.responseCount || voteDistribution.responses || 0,
    averageCoverage: percent(coverageSummary.averageRate || 0, language),
    eligibleParticipants: landscape.eligibleParticipants || 0,
    excludedParticipants: landscape.excludedParticipants || 0,
    minimumVotes: landscape.minimumVotes || 0,
    explainedVariance: percent(variance, language),
    bootstrapRuns: landscape.reliability?.bootstrapReplicatesCompleted || 0,
    bootstrapMedian: percent(
      landscape.reliability?.bootstrapMedianAdjustedRand || 0,
      language,
    ),
    bootstrapThreshold: percent(
      landscape.reliability?.bootstrapThreshold || 0,
      language,
    ),
    hardGroupStatus: (
      landscape.reliability?.hardGroupStatus === 'publishable'
        ? copy.hardGroupsPublishable
        : copy.hardGroupsWithheld
    ),
  })

  return (
    <article className={`story-report ${preview ? 'is-preview' : ''}`} lang={language}>
      {report.status === 'stale' && <p className="story-stale">{copy.stale}</p>}

      <section className="story-opening">
        <h1>{narrative?.headline || copy.openingTitle}</h1>
        <p className="story-opening-intro">{narrative?.standfirst || copy.intro(meta)}</p>
        <ReportStats meta={meta} copy={copy} />
      </section>

      <CommonGroundProposal
        proposal={proposal}
        meta={meta}
        copy={copy}
        language={language}
      />

      {report.opinionLandscape && (
        <StorySection
          kicker={copy.opinionKicker}
          title={copy.opinionTitle}
          lead={report.opinionLandscape.available
            ? copy.opinionLead
            : copy.opinionUnavailableLead}
          className="story-opinion-section"
        >
          <OpinionLandscape
            landscape={report.opinionLandscape}
            narrative={narrative}
            copy={copy}
          />
        </StorySection>
      )}

      {takeaways.length > 0 && (
        <StorySection
          kicker={copy.takeawaysKicker}
          title={copy.takeawaysTitle}
          lead={copy.takeawaysLead}
        >
          <ol className="story-takeaways">
            {takeaways.map((item, index) => {
              const result = item.id ? item : null
              return (
              <li key={result?.id || `${item.title}-${index}`}>
                <span className="story-number">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{result?.text || item.title}</h3>
                  {result ? (
                    <EvidenceBar result={result} copy={copy} language={language} />
                  ) : (
                    <NarrativeEvidence
                      item={item}
                      statements={statements}
                      copy={copy}
                      language={language}
                    />
                  )}
                </div>
              </li>
              )
            })}
          </ol>
        </StorySection>
      )}

      {!proposal?.groupStatement && keyStatements.length > 0 && (
        <StorySection
          kicker={copy.commonKicker}
          title={copy.commonTitle}
          lead={copy.commonLead}
        >
          <div className="story-statement-table">
            {keyStatements.map((result) => (
              <div className="story-statement-row" key={result.id}>
                <p>{result.text}</p>
                <ResponseDistribution result={result} copy={copy} language={language} />
              </div>
            ))}
          </div>
        </StorySection>
      )}

      {!proposal?.groupStatement && principles.length > 0 && (
        <StorySection
          kicker={copy.principlesKicker}
          title={copy.principlesTitle}
          lead={copy.principlesLead}
        >
          <ol className="story-principles-list">
            {principles.map((principle, index) => (
              <li key={`${principle.title}-${index}`}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{principle.title}</h3>
                  <NarrativeEvidence
                    item={principle}
                    statements={statements}
                    copy={copy}
                    language={language}
                    showBar={false}
                  />
                </div>
              </li>
            ))}
          </ol>
        </StorySection>
      )}

      {!proposal?.groupStatement && actionAreas.length > 0 && (
        <StorySection
          kicker={copy.actionKicker}
          title={copy.actionTitle}
          lead={copy.actionLead}
        >
          <ol className="story-action-list">
            {actionAreas.map((area, index) => (
              <li key={`${area.title}-${index}`}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{area.title}</h3>
                  <NarrativeEvidence
                    item={area}
                    statements={statements}
                    copy={copy}
                    language={language}
                    showBar={false}
                  />
                </div>
              </li>
            ))}
          </ol>
        </StorySection>
      )}

      {overlaps.length > 0 && (
        <StorySection
          kicker={copy.overlapKicker}
          title={copy.overlapTitle}
          lead={copy.overlapLead}
          className="story-overlap-section"
        >
          <div className="story-venn-list">
            {overlaps.map((overlap) => (
              <VennFigure
                key={`${overlap.leftStatementId}-${overlap.rightStatementId}`}
                overlap={overlap}
                statements={statements}
                copy={copy}
                language={language}
              />
            ))}
          </div>
        </StorySection>
      )}

      {results.length > 0 && (
        <StorySection
          kicker={copy.coverageKicker}
          title={copy.coverageTitle}
          lead={copy.coverageLead}
          className="story-coverage-section"
        >
          <div className="story-overall-distribution">
            <h3>{copy.overallResponsePattern}</h3>
            <ResponseDistribution
              result={voteDistribution}
              copy={copy}
              language={language}
            />
          </div>
          <CoverageOverview
            results={results}
            summary={coverageSummary}
            voterCount={meta.voterCount || 0}
            copy={copy}
            language={language}
          />
        </StorySection>
      )}

      {(narrativeQuestions.length > 0 || openQuestions.length > 0) && (
        <StorySection
          kicker={copy.questionsKicker}
          title={copy.questionsTitle}
          lead={copy.questionsLead}
        >
          <ol className="story-open-list">
            {narrativeQuestions.length > 0
              ? narrativeQuestions.map((item, index) => (
                <li key={`${item.title}-${index}`}>
                  <div>
                    <h3>{item.title}</h3>
                    <NarrativeEvidence
                      item={item}
                      statements={statements}
                      copy={copy}
                      language={language}
                    />
                  </div>
                </li>
              ))
              : openQuestions.map((result) => (
                <li key={result.id}>
                  <div>
                    <h3>{result.text}</h3>
                    <span>
                      {percent(result.directionalSupportRate, language)} {copy.support}
                      {' · '}
                      {percent(result.coverageRate, language)} {copy.coverage}
                    </span>
                  </div>
                </li>
              ))}
          </ol>
        </StorySection>
      )}

      {!proposal?.groupStatement && (
        <StorySection
          kicker={implications.length > 0 ? copy.implicationsKicker : copy.nextKicker}
          title={implications.length > 0 ? copy.implicationsTitle : copy.nextTitle}
        >
          {implications.length > 0 ? (
            <ol className="story-next-list story-implications-list">
              {implications.map((item, index) => (
                <li key={`${item.title}-${index}`}>
                  <h3>{item.title}</h3>
                  <NarrativeEvidence
                    item={item}
                    statements={statements}
                    copy={copy}
                    language={language}
                    showBar={false}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <ol className="story-next-list">
              <li>{copy.nextCommon}</li>
              <li>{copy.nextOpen}</li>
              <li>{copy.nextCoverage}</li>
            </ol>
          )}
        </StorySection>
      )}

      <AllStatementsTable
        results={results}
        voterCount={meta.voterCount || 0}
        copy={copy}
        language={language}
      />

      <details className="story-methods">
        <summary>{copy.methodsTitle}</summary>
        <div>
          <p>{copy.methodsIntro}</p>
          {report.opinionLandscape?.available && <p>{copy.opinionMethod}</p>}
          {narrative && <p>{copy.narrativeMethod}</p>}
          <ol className="story-method-steps">
            {methodSteps.map((step, index) => (
              <li key={step.title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.text}</p>
                  <small><b>{copy.methodInterpretation}</b> {step.meaning}</small>
                </div>
              </li>
            ))}
          </ol>
          <dl>
            <dt>{copy.minimumEvidence}</dt>
            <dd>{report.evidence?.minimumEvidenceResponses || 0} {copy.responses}</dd>
            <dt>{copy.privacy}</dt>
            <dd>{copy.privacyText}</dd>
            <dt>{copy.generated}</dt>
            <dd>{dateTime(report.generatedAt, language)}</dd>
          </dl>
        </div>
      </details>
    </article>
  )
}
