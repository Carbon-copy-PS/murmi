import { getReportSourceCopy } from './report-source-copy'

export function originalSessionPath(sessionId) {
  return typeof sessionId === 'string' && sessionId ? `/?code=${encodeURIComponent(sessionId)}` : null
}

function entryDate(timestamp) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return null
  const date = new Date(timestamp * 1000)
  return Number.isNaN(date.getTime()) ? null : date
}

export function reportTranscriptText(report, origin) {
  const copy = getReportSourceCopy(report.sourceLanguage)
  const path = originalSessionPath(report.meta?.sessionId)
  const lines = [report.meta?.topic || copy.transcript]
  if (path) lines.push(`${copy.original}: ${new URL(path, origin).href}`)
  lines.push('', copy.lead, '')
  for (const entry of report.transcript || []) {
    const time = entryDate(entry.timestamp)?.toISOString() || copy.unknownTime
    lines.push(`[${time}] ${entry.speaker || copy.speaker}`)
    lines.push(entry.transcriptionStatus === 'missing' ? copy.missing : entry.text, '')
  }
  return lines.join('\n')
}

export function ReportSourceLinks({ report }) {
  const copy = getReportSourceCopy(report.sourceLanguage)
  const path = originalSessionPath(report.meta?.sessionId)
  return (
    <nav className="story-source-links" aria-label={copy.sources}>
      {path && <a href={path} target="_blank" rel="noopener noreferrer" data-testid="report-original-session">{copy.original} <span aria-hidden="true">↗</span></a>}
      <a href="#report-transcript" onClick={(event) => {
        const transcript = event.currentTarget.closest('article')?.querySelector('#report-transcript')
        if (transcript) transcript.open = true
      }}>{copy.transcript} <span aria-hidden="true">↓</span></a>
    </nav>
  )
}

export function ReportTranscript({ report }) {
  const language = report.sourceLanguage || 'en'
  const copy = getReportSourceCopy(language)
  const hasSnapshot = Array.isArray(report.transcript)
  const entries = hasSnapshot ? report.transcript : []

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
        {hasSnapshot && <span>{copy.count(entries.length)}</span>}
      </summary>
      <div className="story-transcript-body">
        {entries.length > 0 ? <>
          <div className="story-transcript-intro">
            <p>{copy.lead}</p>
            <button type="button" onClick={download}>{copy.download}</button>
          </div>
          <ol className="story-transcript-entries" tabIndex={0} aria-label={copy.transcript}>
            {entries.map((entry, index) => {
              const date = entryDate(entry.timestamp)
              return <li key={index} className={entry.transcriptionStatus === 'missing' ? 'is-missing' : ''}>
                <div className="story-transcript-meta">
                  <strong>{entry.speaker || copy.speaker}</strong>
                  {date ? <time dateTime={date.toISOString()}>{new Intl.DateTimeFormat(language, {
                    dateStyle: 'medium', timeStyle: 'medium',
                  }).format(date)}</time> : <span>{copy.unknownTime}</span>}
                </div>
                <p>{entry.transcriptionStatus === 'missing' ? copy.missing : entry.text}</p>
              </li>
            })}
          </ol>
        </> : <p>{hasSnapshot ? copy.empty : copy.legacy}</p>}
      </div>
    </details>
  )
}
