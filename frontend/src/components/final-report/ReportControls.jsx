import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import FinalReportPage from './FinalReportPage'
import { getReportCopy } from './report-copy'

export default function ReportControls({
  status = 'none',
  report = null,
  publicId = null,
  onGenerate = () => {},
  onPublish = () => {},
}) {
  const { i18n } = useTranslation()
  const [showPreview, setShowPreview] = useState(false)
  const copy = getReportCopy(report?.sourceLanguage || i18n.language)
  const publicUrl = publicId ? `/r/${encodeURIComponent(publicId)}` : null
  const hasDraft = Boolean(report && ['draft_ready', 'published', 'stale'].includes(status))

  return (
    <section className="report-controls" data-testid="report-controls">
      <div className="report-controls-copy">
        <p className="story-kicker">{copy.controlsTitle}</p>
        <p>
          {status === 'generating' && copy.generating}
          {status === 'draft_ready' && copy.draftReady}
          {status === 'published' && copy.published}
          {status === 'stale' && copy.staleDraft}
          {status === 'failed' && copy.failed}
          {status === 'none' && copy.controlsDesc}
        </p>
      </div>
      <div className="report-controls-actions">
        {status === 'none' || status === 'failed' ? (
          <button onClick={onGenerate}>{copy.generate}</button>
        ) : null}
        {status === 'generating' && <span className="report-controls-progress" />}
        {hasDraft && (
          <button className="secondary" onClick={() => setShowPreview((value) => !value)}>
            {showPreview ? copy.hidePreview : copy.preview}
          </button>
        )}
        {status === 'draft_ready' && (
          <button onClick={onPublish}>{copy.publishAndShare || copy.publish}</button>
        )}
        {status === 'stale' && (
          <button onClick={onGenerate}>{copy.regenerate}</button>
        )}
        {status === 'published' && publicUrl && (
          <a href={publicUrl} target="_blank" rel="noreferrer">{copy.openReport}</a>
        )}
      </div>
      {showPreview && report && (
        <div className="report-preview">
          <FinalReportPage report={report} preview />
        </div>
      )}
    </section>
  )
}
