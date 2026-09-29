import { getReportSourceCopy } from './report-source-copy'

export default function ReportPdfDownload({ publicId, language = 'en' }) {
  if (!publicId) return null
  const copy = getReportSourceCopy(language)
  return <a
    className="pub-share-copy pub-share-pdf"
    href={`/api/public/results/${encodeURIComponent(publicId)}/report.pdf`}
    download
    title={copy.pdfIncludesTranscript}
    data-testid="report-pdf-download"
  >
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 2v10m-4-4 4 4 4-4M3 13v4h14v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    {copy.downloadPdf}
  </a>
}
