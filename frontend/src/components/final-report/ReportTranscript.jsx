import { getReportSourceCopy } from './report-source-copy'
import { getReadingCopy, transcriptParagraphs } from './report-reading'

export function originalSessionPath(sessionId) {
  return typeof sessionId === 'string' && sessionId ? `/?code=${encodeURIComponent(sessionId)}` : null
}

export function reportTranscriptText(report, origin) {
  const copy = getReportSourceCopy(report.sourceLanguage)
  const path = originalSessionPath(report.meta?.sessionId)
  const lines = [report.meta?.topic || copy.transcript]
  if (path) lines.push(`${copy.original}: ${new URL(path, origin).href}`)
  lines.push('', getReadingCopy(report.sourceLanguage).transcriptIntro, '')
  for (const paragraph of transcriptParagraphs(report.transcript || [])) {
    lines.push(paragraph.missing ? copy.missing : paragraph.text, '')
  }
  return lines.join('\n')
}

export function ReportSourceLinks({ report }) {
  const copy = getReportSourceCopy(report.sourceLanguage)
  const path = originalSessionPath(report.meta?.sessionId)
  return (
    <nav className="story-source-links" aria-label={copy.sources}>
      <a href="#report-transcript" onClick={(event) => {
        const transcript = event.currentTarget.closest('article')?.querySelector('#report-transcript')
        if (transcript) transcript.open = true
      }}>{copy.transcript} <span aria-hidden="true">↓</span></a>
      {path && <a className="story-original-session" href={path} target="_blank" rel="noopener noreferrer" data-testid="report-original-session">{copy.original} <span aria-hidden="true">↗</span></a>}
    </nav>
  )
}

export function ReportTranscript({ report }) {
  const language = report.sourceLanguage || 'en'
  const copy = getReportSourceCopy(language)
  const hasSnapshot = Array.isArray(report.transcript)
  const entries = hasSnapshot ? report.transcript : []
  const paragraphs = transcriptParagraphs(entries)

  function download() {
    const url = URL.createObjectURL(new Blob([reportTranscriptText(report, window.location.origin)], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `murmi-${(report.meta?.sessionId || 'session').replace(/[^a-z0-9-]/gi, '_')}-transcript.txt`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <details className="story-transcript" id="report-transcript" data-testid="report-transcript">
      <summary>
        <h2>{copy.transcript}</h2>
      </summary>
      <div className="story-transcript-body">
        {entries.length > 0 ? <>
          <div className="story-transcript-intro">
            <p>{getReadingCopy(language).transcriptIntro}</p>
            <button type="button" onClick={download}>{copy.download}</button>
          </div>
          <div className="story-transcript-entries" aria-label={copy.transcript}>
            {paragraphs.map((paragraph, index) => <p key={index} className={paragraph.missing ? 'is-missing' : ''}>
              {paragraph.missing ? copy.missing : paragraph.text}
            </p>)}
          </div>
        </> : <p>{hasSnapshot ? copy.empty : copy.legacy}</p>}
      </div>
    </details>
  )
}
