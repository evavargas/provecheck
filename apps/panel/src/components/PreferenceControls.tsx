import {
  LOCALES,
  THEME_PREFERENCES,
  type IconName,
  type Locale,
  type ThemePreference,
} from '@provecheck/shared';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

const LANGUAGE_NAMES: Record<Locale, string> = { 'es-UY': 'Español', en: 'English' };
const THEME_ICON: Record<ThemePreference, IconName> = {
  light: 'lightMode',
  dark: 'darkMode',
  system: 'darkMode',
};

/** Compact controls (spec 16): language picker and a theme button that cycles Claro / Oscuro / Sistema. */
export function PreferenceControls(props: {
  theme: ThemePreference;
  locale: Locale;
  onTheme: (t: ThemePreference) => void;
  onLocale: (l: Locale) => void;
}) {
  const { t } = useTranslation();
  const next =
    THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(props.theme) + 1) % THEME_PREFERENCES.length]!;
  return (
    <div className="prefs">
      <label className="lang">
        <Icon name="language" size={18} />
        <span className="sr-only">{t('prefs.language')}</span>
        <select value={props.locale} onChange={(e) => props.onLocale(e.target.value as Locale)}>
          {LOCALES.map((v) => (
            <option key={v} value={v}>
              {LANGUAGE_NAMES[v]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="icon-button"
        title={`${t('prefs.theme')}: ${t(`prefs.${props.theme}`)}`}
        aria-label={`${t('prefs.theme')}: ${t(`prefs.${props.theme}`)}. ${t(`prefs.${next}`)}`}
        onClick={() => props.onTheme(next)}
      >
        <Icon name={THEME_ICON[props.theme]} />
      </button>
    </div>
  );
}
