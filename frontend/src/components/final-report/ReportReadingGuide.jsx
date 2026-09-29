import { getReadingCopy, readingText } from './report-reading'

export default function ReportReadingGuide({ report }) {
  const copy = getReadingCopy(report.sourceLanguage)
  const meta = report.meta || {}
  const coverage = report.analysis?.responseCoverage?.averageRate
  const landscape = report.opinionLandscape || {}
  const hasEditorial = report.narrative?.[report.sourceLanguage] || landscape.themes?.groups?.length || report.commonGroundProposal?.groupStatement
  return <div className="story-reading-guide">
    <h3>{copy.participationTitle}</h3>
    <p>{readingText(copy.participation,{voters:meta.voterCount || 0, statements:report.evidence?.statements?.length || 0, responses:meta.responseCount || 0})}</p>
    {coverage != null && <p>{readingText(copy.coverage,{coverage:Math.round(coverage*100)})}</p>}
    <p data-testid="report-scope-note">{copy.scope}</p>
    <h3>{copy.votesTitle}</h3><p>{copy.votes}</p>
    {landscape.available && <><h3>{copy.groupsTitle}</h3><p>{copy.groups}</p></>}
    <h3>{copy.preparedTitle}</h3><p>{copy.prepared}</p>
    {hasEditorial && <p>{copy.ai}</p>}
  </div>
}
