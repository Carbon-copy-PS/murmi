const COPY = {
  en: {
    sources: 'Session sources', original: 'Original session', transcript: 'Discussion transcript',
    count: (n) => `${n} transcript ${n === 1 ? 'entry' : 'entries'}`,
    lead: 'Saved when this report was generated. Automatic transcription may contain errors; speaker labels identify the recorder and may cover several speakers.',
    download: 'Download transcript (.txt)', missing: 'Audio segment could not be transcribed.',
    empty: 'No transcript was recorded for this session.', legacy: 'No transcript was included in this saved report.',
    speaker: 'Recorder', unknownTime: 'Time unavailable',
  },
  zh: {
    sources: '討論來源', original: '原始討論', transcript: '討論逐字稿',
    count: (n) => `${n} 段逐字稿`,
    lead: '此逐字稿保存於報告生成時。自動轉錄可能有誤；講者標籤代表錄音來源，可能包含多位講者。',
    download: '下載逐字稿（.txt）', missing: '此段音訊無法轉錄。',
    empty: '這場討論沒有記錄逐字稿。', legacy: '此已儲存的報告未包含逐字稿。',
    speaker: '錄音來源', unknownTime: '時間不詳',
  },
  de: {
    sources: 'Gesprächsquellen', original: 'Ursprüngliche Sitzung', transcript: 'Gesprächstranskript',
    count: (n) => `${n} Transkriptabschnitte`,
    lead: 'Bei der Berichtserstellung gespeichert. Automatische Transkription kann Fehler enthalten; eine Aufnahmequelle kann mehrere Sprechende umfassen.',
    download: 'Transkript herunterladen (.txt)', missing: 'Dieser Audioabschnitt konnte nicht transkribiert werden.',
    empty: 'Für diese Sitzung wurde kein Transkript aufgezeichnet.', legacy: 'Dieser gespeicherte Bericht enthält kein Transkript.',
    speaker: 'Aufnahmequelle', unknownTime: 'Zeit unbekannt',
  },
  fr: {
    sources: 'Sources de la discussion', original: 'Session d’origine', transcript: 'Transcription de la discussion',
    count: (n) => `${n} passages transcrits`,
    lead: 'Enregistrée lors de la création du rapport. La transcription automatique peut contenir des erreurs ; une même source audio peut couvrir plusieurs personnes.',
    download: 'Télécharger la transcription (.txt)', missing: 'Ce passage audio n’a pas pu être transcrit.',
    empty: 'Aucune transcription n’a été enregistrée pour cette session.', legacy: 'Ce rapport enregistré ne contient pas de transcription.',
    speaker: 'Source audio', unknownTime: 'Heure inconnue',
  },
  it: {
    sources: 'Fonti della discussione', original: 'Sessione originale', transcript: 'Trascrizione della discussione',
    count: (n) => `${n} segmenti trascritti`,
    lead: 'Salvata alla creazione del rapporto. La trascrizione automatica può contenere errori; una fonte audio può comprendere più persone.',
    download: 'Scarica la trascrizione (.txt)', missing: 'Questo segmento audio non è stato trascritto.',
    empty: 'Non è stata registrata una trascrizione per questa sessione.', legacy: 'Questo rapporto salvato non contiene una trascrizione.',
    speaker: 'Fonte audio', unknownTime: 'Ora non disponibile',
  },
}

export function getReportSourceCopy(language = 'en') {
  return COPY[language.toLowerCase().split('-')[0]] || COPY.en
}
