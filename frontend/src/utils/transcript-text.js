export function usesTraditionalChinese(language) {
  return ['zh', 'zh-tw', 'zh-hant', 'zh-hant-tw'].includes((language || '').toLowerCase())
}

export function buildTranscriptDownload(entries, language, missingLabel, formatText = (text) => text || '') {
  return entries.map((entry) => {
    const time = new Date(entry.timestamp * 1000).toISOString()
    const text = entry.transcriptionStatus === 'missing'
      ? missingLabel
      : formatText(entry.text, language)
    return `[${time}] ${entry.speaker || ''}\n${text}`
  }).join('\n\n') + '\n'
}

export function buildOriginalTranscriptDownload(entries, language) {
  return JSON.stringify({
    format: 'murmi-original-transcript-v1',
    displayLanguage: language,
    displayConversion: usesTraditionalChinese(language) ? 'OpenCC s2tw (opencc-js 1.4.2)' : null,
    // Includes original text, per-item output and missing-segment metadata.
    entries,
  }, null, 2)
}
