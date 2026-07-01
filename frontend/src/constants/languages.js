export const SPOKEN_LANGUAGES = [
  { code: 'bg', flag: '🇧🇬', label: 'Bulgarian', native: 'Български' },
  { code: 'hr', flag: '🇭🇷', label: 'Croatian', native: 'Hrvatski' },
  { code: 'cs', flag: '🇨🇿', label: 'Czech', native: 'Čeština' },
  { code: 'da', flag: '🇩🇰', label: 'Danish', native: 'Dansk' },
  { code: 'nl', flag: '🇳🇱', label: 'Dutch', native: 'Nederlands' },
  { code: 'en', flag: '🇬🇧', label: 'English', native: 'English' },
  { code: 'et', flag: '🇪🇪', label: 'Estonian', native: 'Eesti' },
  { code: 'fi', flag: '🇫🇮', label: 'Finnish', native: 'Suomi' },
  { code: 'fr', flag: '🇫🇷', label: 'French', native: 'Français' },
  { code: 'de', flag: '🇩🇪', label: 'German', native: 'Deutsch · Schwiizerdütsch' },
  { code: 'el', flag: '🇬🇷', label: 'Greek', native: 'Ελληνικά' },
  { code: 'hu', flag: '🇭🇺', label: 'Hungarian', native: 'Magyar' },
  { code: 'ga', flag: '🇮🇪', label: 'Irish', native: 'Gaeilge' },
  { code: 'it', flag: '🇮🇹', label: 'Italian', native: 'Italiano' },
  { code: 'lv', flag: '🇱🇻', label: 'Latvian', native: 'Latviešu' },
  { code: 'lt', flag: '🇱🇹', label: 'Lithuanian', native: 'Lietuvių' },
  { code: 'mt', flag: '🇲🇹', label: 'Maltese', native: 'Malti' },
  { code: 'pl', flag: '🇵🇱', label: 'Polish', native: 'Polski' },
  { code: 'pt', flag: '🇵🇹', label: 'Portuguese', native: 'Português' },
  { code: 'ro', flag: '🇷🇴', label: 'Romanian', native: 'Română' },
  { code: 'sk', flag: '🇸🇰', label: 'Slovak', native: 'Slovenčina' },
  { code: 'sl', flag: '🇸🇮', label: 'Slovenian', native: 'Slovenščina' },
  { code: 'es', flag: '🇪🇸', label: 'Spanish', native: 'Español' },
  { code: 'sv', flag: '🇸🇪', label: 'Swedish', native: 'Svenska' },
  { code: 'zh', flag: '🇹🇼', label: 'Traditional Chinese', native: '繁體中文' },
].sort((a, b) => a.label.localeCompare(b.label))

export const SHOWCASE_LANGUAGE_CODES = ['en', 'de', 'fr', 'it', 'zh']

export const SHOWCASE_LANGUAGES = SHOWCASE_LANGUAGE_CODES
  .map((code) => SPOKEN_LANGUAGES.find((lang) => lang.code === code))
  .filter(Boolean)

export const LANGUAGE_SHOWCASE = [
  ...SHOWCASE_LANGUAGES,
  ...SPOKEN_LANGUAGES.filter((lang) => !SHOWCASE_LANGUAGE_CODES.includes(lang.code)),
]

export const LANGUAGE_OPTIONS = [...LANGUAGE_SHOWCASE]

export const DEFAULT_LANGUAGE = 'en'

export const LANGUAGE_CODES = SPOKEN_LANGUAGES.map((lang) => lang.code)

const LANGUAGE_MAP = Object.fromEntries(LANGUAGE_OPTIONS.map((lang) => [lang.code, lang]))

export function getLanguage(code) {
  return LANGUAGE_MAP[code] || null
}

export function getLanguageLabel(code) {
  const lang = getLanguage(code)
  return lang ? lang.native : code
}

export function filterLanguages(query) {
  const q = query.trim().toLowerCase()
  if (!q) return LANGUAGE_OPTIONS
  return LANGUAGE_OPTIONS.filter((lang) => (
    lang.label.toLowerCase().includes(q)
    || lang.native.toLowerCase().includes(q)
    || lang.code.toLowerCase().includes(q)
  ))
}
