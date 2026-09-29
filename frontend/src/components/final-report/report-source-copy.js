const COPY = {
  en: {
    downloadPdf: 'Download PDF', pdfIncludesTranscript: 'Full report, including the discussion transcript',
    sources: 'Session sources', original: 'Original session', transcript: 'Discussion transcript',
    download: 'Download transcript (.txt)', missing: 'Audio segment could not be transcribed.',
    empty: 'No transcript was recorded for this session.', legacy: 'No transcript was included in this saved report.',
  },
  zh: {
    downloadPdf: '下載 PDF', pdfIncludesTranscript: '完整報告，包含討論逐字稿',
    sources: '討論來源', original: '原始討論', transcript: '討論逐字稿',
    download: '下載逐字稿（.txt）', missing: '此段音訊無法轉錄。',
    empty: '這場討論沒有記錄逐字稿。', legacy: '此已儲存的報告未包含逐字稿。',
  },
  de: {
    downloadPdf: 'PDF herunterladen', pdfIncludesTranscript: 'Vollständiger Bericht mit Gesprächstranskript',
    sources: 'Gesprächsquellen', original: 'Ursprüngliche Sitzung', transcript: 'Gesprächstranskript',
    download: 'Transkript herunterladen (.txt)', missing: 'Dieser Audioabschnitt konnte nicht transkribiert werden.',
    empty: 'Für diese Sitzung wurde kein Transkript aufgezeichnet.', legacy: 'Dieser gespeicherte Bericht enthält kein Transkript.',
  },
  fr: {
    downloadPdf: 'Télécharger le PDF', pdfIncludesTranscript: 'Rapport complet avec la transcription de la discussion',
    sources: 'Sources de la discussion', original: 'Session d’origine', transcript: 'Transcription de la discussion',
    download: 'Télécharger la transcription (.txt)', missing: 'Ce passage audio n’a pas pu être transcrit.',
    empty: 'Aucune transcription n’a été enregistrée pour cette session.', legacy: 'Ce rapport enregistré ne contient pas de transcription.',
  },
  it: {
    downloadPdf: 'Scarica PDF', pdfIncludesTranscript: 'Rapporto completo con la trascrizione della discussione',
    sources: 'Fonti della discussione', original: 'Sessione originale', transcript: 'Trascrizione della discussione',
    download: 'Scarica la trascrizione (.txt)', missing: 'Questo segmento audio non è stato trascritto.',
    empty: 'Non è stata registrata una trascrizione per questa sessione.', legacy: 'Questo rapporto salvato non contiene una trascrizione.',
  },
}

export function getReportSourceCopy(language = 'en') {
  return COPY[language.toLowerCase().split('-')[0]] || COPY.en
}
