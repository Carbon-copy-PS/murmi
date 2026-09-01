import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

export default function TranscriptPanel({ entries, partial, error }) {
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
          t('transcript.empty')
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
          <p>{entry.text}</p>
        </div>
      ))}
      {partial?.text && (
        <div className="entry partial">
          <span className="speaker">{partial.speaker}</span>
          <span className="live-dot">{t('transcript.live')}</span>
          <p>{partial.text}</p>
        </div>
      )}
      {error && <p className="caption-error">{error}</p>}
      <div ref={bottomRef} />
    </div>
  )
}
