import { getReportCopy } from './report-copy'
import './final-report.css'

function percent(value, language) {
  return new Intl.NumberFormat(language, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value || 0)
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
        <span style={{ width: percent(result.supportRate, language) }} />
      </div>
      <div className="story-evidence-meta">
        <strong>{percent(result.supportRate, language)} {copy.support}</strong>
        <span>{percent(result.coverageRate, language)} {copy.coverage}</span>
      </div>
    </div>
  )
}

function VennFigure({ overlap, statements, copy }) {
  const left = statements.get(overlap.leftStatementId)
  const right = statements.get(overlap.rightStatementId)
  if (!left || !right) return null

  return (
    <figure className="story-venn">
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
      <figcaption>{overlap.jointResponses} {copy.jointResponses}</figcaption>
    </figure>
  )
}

const TENDENCY_COLORS = ['#1f6b4f', '#a16b2e', '#5f5a9c']

function OpinionLandscape({ landscape, narrative, copy, language }) {
  if (!landscape?.available) {
    return <p className="story-opinion-unavailable">{copy.opinionUnavailable}</p>
  }
  const density = landscape.density || {}
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
  const cellWidth = plotWidth / (density.columns || 1)
  const cellHeight = plotHeight / (density.rows || 1)

  return (
    <div className="story-opinion">
      <figure className="story-opinion-map">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={copy.opinionTitle}
        >
          <line x1={insetX} y1={height / 2} x2={width - insetX} y2={height / 2} />
          <line x1={width / 2} y1={insetY} x2={width / 2} y2={height - insetY} />
          {(density.cells || []).map((cell) => {
            const opacity = density.maximumCellCount
              ? 0.12 + 0.38 * (cell.count / density.maximumCellCount)
              : 0.12
            return (
              <g key={`${cell.row}-${cell.column}`}>
                <rect
                  x={insetX + cell.column * cellWidth + 3}
                  y={insetY + cell.row * cellHeight + 3}
                  width={Math.max(0, cellWidth - 6)}
                  height={Math.max(0, cellHeight - 6)}
                  style={{ opacity }}
                />
                <text
                  x={insetX + (cell.column + 0.5) * cellWidth}
                  y={insetY + (cell.row + 0.5) * cellHeight}
                >
                  {cell.count}
                </text>
              </g>
            )
          })}
          {profiles.map((profile, index) => {
            const x = insetX + profile.position.x * plotWidth
            const y = insetY + profile.position.y * plotHeight
            const radius = 26 + 42 * Math.sqrt(profile.membershipShare || 0)
            return (
              <g className="story-opinion-tendency" key={profile.tendencyId}>
                <circle
                  cx={x}
                  cy={y}
                  r={radius}
                  style={{ '--tendency-color': TENDENCY_COLORS[index % TENDENCY_COLORS.length] }}
                />
                <text x={x} y={y + 5}>
                  {String.fromCharCode(65 + index)}
                </text>
              </g>
            )
          })}
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
          <span>{density.shownParticipants || 0} {copy.densityShown}</span>
          {density.suppressedParticipants > 0 && (
            <span>{density.suppressedParticipants} {copy.densitySuppressed}</span>
          )}
        </figcaption>
      </figure>

      {dimensions.length > 0 && (
        <div className="story-dimensions">
          {dimensions.map((dimension) => (
            <div key={dimension.axis}>
              <p className="story-kicker">{copy.dimension} {dimension.axis}</p>
              <h3>{dimension.label}</h3>
              <div className="story-dimension-ends">
                <span>{dimension.negativeLabel}</span>
                <span>{dimension.positiveLabel}</span>
              </div>
              <p>{dimension.explanation}</p>
            </div>
          ))}
        </div>
      )}

      <div className="story-tendency-list">
        {profiles.map((profile, index) => {
          const editorial = tendencyNarrative.get(profile.tendencyId)
          return (
            <section key={profile.tendencyId}>
              <div className="story-tendency-title">
                <span style={{ background: TENDENCY_COLORS[index % TENDENCY_COLORS.length] }}>
                  {String.fromCharCode(65 + index)}
                </span>
                <div>
                  <h3>{editorial?.title || `${copy.tendency} ${String.fromCharCode(65 + index)}`}</h3>
                  <p>{copy.approximateShare(percent(profile.membershipShare, language))}</p>
                </div>
              </div>
              {editorial?.description && <p className="story-tendency-description">{editorial.description}</p>}
              <strong>{copy.tendencyPriorities}</strong>
              <ul>
                {(profile.priorities || []).map((priority) => (
                  <li key={priority.statementId}>{priority.text}</li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      {landscape.tendencies?.overlapSummary && (
        <p className="story-opinion-overlap">
          <strong>{landscape.tendencies.overlapSummary.participantsWithMultipleTendencies}</strong>
          {' '}
          {copy.multiTendency}
        </p>
      )}
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
  const statements = new Map(results.map((result) => [result.id, result]))
  const fallbackTakeaways = (report.story?.takeawayStatementIds || [])
    .map((id) => statements.get(id))
    .filter(Boolean)
  const commonGround = (report.story?.commonGroundStatementIds || [])
    .map((id) => statements.get(id))
    .filter(Boolean)
  const openQuestions = (report.story?.openQuestionStatementIds || [])
    .map((id) => statements.get(id))
    .filter(Boolean)
  const overlaps = report.story?.overlaps || []
  const proposal = report.commonGroundProposal
  const narrative = report.narrative?.[language] || null
  const narrativeTakeaways = (narrative?.takeaways || []).filter(
    (item) => (item.evidenceStatementIds || []).some((id) => statements.has(id)),
  )
  const principles = (narrative?.principles || []).filter(
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

  return (
    <article className={`story-report ${preview ? 'is-preview' : ''}`} lang={language}>
      {report.status === 'stale' && <p className="story-stale">{copy.stale}</p>}

      <section className="story-opening">
        <p className="story-kicker">{copy.finalReport} · {copy.version} {report.version}</p>
        <h1>{narrative?.headline || copy.openingTitle}</h1>
        <p className="story-opening-intro">{narrative?.standfirst || copy.intro(meta)}</p>
        <dl className="story-stats">
          <div><dt>{meta.voterCount || 0}</dt><dd>{copy.voters}</dd></div>
          <div><dt>{meta.statementCount || 0}</dt><dd>{copy.statements}</dd></div>
          <div><dt>{meta.responseCount || 0}</dt><dd>{copy.responses}</dd></div>
        </dl>
      </section>

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

      {commonGround.length > 0 && (
        <StorySection
          kicker={copy.commonKicker}
          title={copy.commonTitle}
          lead={copy.commonLead}
        >
          <div className="story-statement-table">
            {commonGround.map((result) => (
              <div className="story-statement-row" key={result.id}>
                <p>{result.text}</p>
                <EvidenceBar result={result} copy={copy} language={language} />
              </div>
            ))}
          </div>
        </StorySection>
      )}

      {principles.length > 0 && (
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
              />
            ))}
          </div>
        </StorySection>
      )}

      {report.opinionLandscape && (
        <StorySection
          kicker={copy.opinionKicker}
          title={copy.opinionTitle}
          lead={copy.opinionLead}
          className="story-opinion-section"
        >
          <OpinionLandscape
            landscape={report.opinionLandscape}
            narrative={narrative}
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

      {proposal?.groupStatement && (
        <StorySection
          kicker={copy.proposalKicker}
          title={copy.proposalTitle}
          className="story-proposal-section"
        >
          <blockquote>{proposal.groupStatement}</blockquote>
          <div className="story-proposal-validation">
            <strong>{copy.participantValidation}</strong>
            {proposal.votes?.total > 0 ? (
              <span>
                {proposal.votes.agree} {copy.agreed}
                {' · '}
                {proposal.votes.disagree} {copy.disagreed}
              </span>
            ) : <span>{copy.proposalUnvalidated}</span>}
          </div>
        </StorySection>
      )}

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

      <details className="story-methods">
        <summary>{copy.methodsTitle}</summary>
        <div>
          <p>{copy.methodsIntro}</p>
          {report.opinionLandscape?.available && <p>{copy.opinionMethod}</p>}
          {narrative && <p>{copy.narrativeMethod}</p>}
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
