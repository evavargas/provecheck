import { DEFAULT_LOCALE, LOCALES, type Locale } from '@provecheck/shared';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../../../packages/shared/i18n/en.json';
import es from '../../../packages/shared/i18n/es.json';

/** Device language when the profile has none (RN-29): English devices get `en`, everything else es-UY. */
const deviceLocale = (): Locale => (getLocales()[0]?.languageCode === 'en' ? 'en' : DEFAULT_LOCALE);

void i18n.use(initReactI18next).init({
  resources: { 'es-UY': { translation: es }, en: { translation: en } },
  lng: deviceLocale(),
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
});

export const isLocale = (v: string | null): v is Locale => LOCALES.some((l) => l === v);
export const setLocale = (locale: Locale) => i18n.changeLanguage(locale);
export { deviceLocale };
export default i18n;
