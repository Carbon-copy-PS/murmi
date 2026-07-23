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
  const takeaways = (report.story?.takeawayStatementIds || [])
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

  return (
    <article className={`story-report ${preview ? 'is-preview' : ''}`} lang={language}>
      {report.status === 'stale' && <p className="story-stale">{copy.stale}</p>}

      <section className="story-opening">
        <p className="story-kicker">{copy.finalReport} · {copy.version} {report.version}</p>
        <h1>{copy.openingTitle}</h1>
        <p className="story-opening-intro">{copy.intro(meta)}</p>
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
            {takeaways.map((result, index) => (
              <li key={result.id}>
                <span className="story-number">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{result.text}</h3>
                  <EvidenceBar result={result} copy={copy} language={language} />
                </div>
              </li>
            ))}
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

      {openQuestions.length > 0 && (
        <StorySection
          kicker={copy.questionsKicker}
          title={copy.questionsTitle}
          lead={copy.questionsLead}
        >
          <ol className="story-open-list">
            {openQuestions.map((result) => (
              <li key={result.id}>
                <p>{result.text}</p>
                <span>
                  {percent(result.directionalSupportRate, language)} {copy.support}
                  {' · '}
                  {percent(result.coverageRate, language)} {copy.coverage}
                </span>
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

      <StorySection kicker={copy.nextKicker} title={copy.nextTitle}>
        <ol className="story-next-list">
          <li>{copy.nextCommon}</li>
          <li>{copy.nextOpen}</li>
          <li>{copy.nextCoverage}</li>
        </ol>
      </StorySection>

      <details className="story-methods">
        <summary>{copy.methodsTitle}</summary>
        <div>
          <p>{copy.methodsIntro}</p>
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
