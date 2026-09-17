import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

export default function TranscriptPanel({ entries, partial, error, finishing = false, recording = false }) {
  const { t } = useTranslation()
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries, partial?.text])

  if (entries.length === 0 && !partial?.text) {
    return (
      <div className="transcript empty" data-testid="transcript-empty">
        {error ? (
          <div className="transcript-alert" role="alert">
            <p className="caption-error">{error}</p>
          </div>
        ) : (
          <span role="status">{t(finishing ? 'transcript.finishing' : 'transcript.empty')}</span>
        )}
      </div>
    )
  }

  return (
    <div className="transcript">
      {entries.map((entry, i) => (
        <div key={entry.id || `${entry.timestamp}-${i}`} className="entry">
          <span className="speaker">{entry.speaker}</span>
          <span className="time">
            {new Date(entry.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <p className={entry.transcriptionStatus === 'missing' ? 'caption-error' : undefined}>
            {entry.transcriptionStatus === 'missing' ? t('transcript.missingSegment') : entry.text}
          </p>
        </div>
      ))}
      {partial?.text && (
        <div className="entry partial">
          <span className="speaker">{partial.speaker}</span>
          <span className="live-dot">{t(recording ? 'transcript.live' : 'transcript.unconfirmed')}</span>
          <p>{partial.text}</p>
        </div>
      )}
      {error && <p className="caption-error">{error}</p>}
      {finishing && <p role="status">{t('transcript.finishing')}</p>}
      <div ref={bottomRef} />
    </div>
  )
}
