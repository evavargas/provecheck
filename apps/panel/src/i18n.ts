import { DEFAULT_LOCALE } from '@provecheck/shared';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../../../packages/shared/i18n/en.json';
import es from '../../../packages/shared/i18n/es.json';

void i18n.use(initReactI18next).init({
  resources: { 'es-UY': { translation: es }, en: { translation: en } },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
});

export default i18n;
