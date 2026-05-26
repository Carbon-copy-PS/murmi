import { useEffect, useRef } from 'react'

export default function TranscriptPanel({ entries }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  if (entries.length === 0) {
    return <div className="transcript empty">Transcript will appear here</div>
  }

  return (
    <div className="transcript">
      {entries.map((entry, i) => (
        <div key={i} className="entry">
          <span className="speaker">{entry.speaker}</span>
          <span className="time">
            {new Date(entry.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <p>{entry.text}</p>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
