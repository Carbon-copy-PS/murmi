import { useEffect, useRef } from 'react'

export default function TranscriptPanel({ entries, partial, error }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries, partial?.text])

  if (entries.length === 0 && !partial?.text && !error) {
    return <div className="transcript empty">Transcript will appear here</div>
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
          <span className="live-dot">Live</span>
          <p>{partial.text}</p>
        </div>
      )}
      {error && <p className="caption-error">{error}</p>}
      <div ref={bottomRef} />
    </div>
  )
}
