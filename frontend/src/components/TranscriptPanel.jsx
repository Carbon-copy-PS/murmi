import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usesTraditionalChinese, buildTranscriptDownload, buildOriginalTranscriptDownload } from '../utils/transcript-text'
import { downloadFile, exportVotesFilename } from '../utils/export-results'

const originalText = (text) => text || ''

export default function TranscriptPanel({ entries, partial, error, finishing = false, recording = false, language = 'en', sessionId, formatText = originalText, allowExport = true }) {
  const { t } = useTranslation()
  const bottomRef = useRef(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const displayLanguage = showOriginal ? null : language
  const readableEntries = useMemo(() => entries.map((entry) => ({
    ...entry, text: formatText(entry.text, displayLanguage),
  })), [entries, displayLanguage, formatText])
  const readablePartial = formatText(partial?.text, displayLanguage)

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
      <div className="transcript-tools">
        {usesTraditionalChinese(language) && (
          <label>
            <input type="checkbox" checked={showOriginal} onChange={(event) => setShowOriginal(event.target.checked)} />
            {t('transcript.showOriginal')}
          </label>
        )}
        {allowExport && (
          <>
            <button type="button" disabled={!entries.length} onClick={() => downloadFile(
              exportVotesFilename(sessionId, 'transcript', 'txt'),
              buildTranscriptDownload(entries, language, t('transcript.missingSegment'), formatText),
              'text/plain;charset=utf-8',
            )}>{t('transcript.download')}</button>
            <button type="button" disabled={!entries.length} onClick={() => downloadFile(
              exportVotesFilename(sessionId, 'transcript-original', 'json'),
              buildOriginalTranscriptDownload(entries, language),
              'application/json;charset=utf-8',
            )}>{t('transcript.downloadOriginal')}</button>
          </>
        )}
      </div>
      {readableEntries.map((entry, i) => (
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
          <p>{readablePartial}</p>
        </div>
      )}
      {error && <p className="caption-error">{error}</p>}
      {finishing && <p role="status">{t('transcript.finishing')}</p>}
      <div ref={bottomRef} />
    </div>
  )
}
