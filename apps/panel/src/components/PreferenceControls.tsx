import { LOCALES, THEME_PREFERENCES, type Locale, type ThemePreference } from '@provecheck/shared';
import { useTranslation } from 'react-i18next';

const LANGUAGE_NAMES: Record<Locale, string> = { 'es-UY': 'Español', en: 'English' };

/** Compact theme + language controls for screens without a session (and the user menu). */
export function PreferenceControls(props: {
  theme: ThemePreference;
  locale: Locale;
  onTheme: (t: ThemePreference) => void;
  onLocale: (l: Locale) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="prefs">
      <label>
        <span className="sr-only">{t('prefs.theme')}</span>
        <select
          value={props.theme}
          onChange={(e) => props.onTheme(e.target.value as ThemePreference)}
        >
          {THEME_PREFERENCES.map((v) => (
            <option key={v} value={v}>
              {t(`prefs.${v}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="sr-only">{t('prefs.language')}</span>
        <select value={props.locale} onChange={(e) => props.onLocale(e.target.value as Locale)}>
          {LOCALES.map((v) => (
            <option key={v} value={v}>
              {LANGUAGE_NAMES[v]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
