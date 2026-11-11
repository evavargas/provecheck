import { DEFAULT_LOCALE, LOCALES, type Locale } from '@provecheck/shared';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../../../packages/shared/i18n/en.json';
import es from '../../../packages/shared/i18n/es.json';

const KEY = 'provecheck.locale';
const stored = localStorage.getItem(KEY);
const initial = LOCALES.find((l) => l === stored) ?? DEFAULT_LOCALE;

void i18n.use(initReactI18next).init({
  resources: { 'es-UY': { translation: es }, en: { translation: en } },
  lng: initial,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
});

export function setLocale(locale: Locale) {
  localStorage.setItem(KEY, locale);
  document.documentElement.lang = locale;
  void i18n.changeLanguage(locale);
}

document.documentElement.lang = initial;
export default i18n;
