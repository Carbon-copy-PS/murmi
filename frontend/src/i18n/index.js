import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import de from './locales/de.json'
import fr from './locales/fr.json'
import it from './locales/it.json'
import zh from './locales/zh.json'

export const UI_LANGUAGES = ['en', 'de', 'fr', 'it', 'zh']

export function resolveUiLanguage(code) {
  return UI_LANGUAGES.includes(code) ? code : 'en'
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
    fr: { translation: fr },
    it: { translation: it },
    zh: { translation: zh },
  },
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: UI_LANGUAGES,
  interpolation: { escapeValue: false },
  returnEmptyString: false,
})

export default i18n
