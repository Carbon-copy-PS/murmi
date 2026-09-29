import copy from '../../../../shared/report-reading-copy.json'

export function getReadingCopy(language = 'en') {
  return copy[(language || 'en').toLowerCase().split('-')[0]] || copy.en
}

export function readingText(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '')
}

// Keep this deterministic reflow aligned with backend/app/report_reading.py.
export function transcriptParagraphs(entries = []) {
  const paragraphs = []
  let pending = []
  function flush() {
    const text = pending.join(' ').trim()
    let start = 0
    for (const match of text.matchAll(/[.!?]["”’)]*(?:\s+|$)|[。！？]/gu)) {
      const end = match.index + match[0].length
      if (end - start >= 650) {
        paragraphs.push({text:text.slice(start,end).trim(), missing:false})
        start = end
      }
    }
    if (text.slice(start).trim()) paragraphs.push({text:text.slice(start).trim(), missing:false})
    pending = []
  }
  for (const entry of entries) {
    if (entry.transcriptionStatus === 'missing') {
      flush()
      paragraphs.push({text:'', missing:true})
    } else if (entry.text?.trim()) pending.push(entry.text.trim())
  }
  flush()
  return paragraphs
}
