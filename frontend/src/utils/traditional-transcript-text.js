import { Converter } from 'opencc-js/cn2t'
import { usesTraditionalChinese } from './transcript-text.js'

let toTraditional

// Presentation only: never replace entry.text or transcriptionItems. Convert
// the entire accumulated caption each time so phrases can cross delta boundaries.
export function transcriptText(text, language) {
  if (!text || !usesTraditionalChinese(language)) return text || ''
  // cn -> tw is OpenCC s2tw; twp would also substitute regional vocabulary.
  toTraditional ||= Converter({ from: 'cn', to: 'tw' })
  return toTraditional(text)
}
