import { LOCALES, THEME_PREFERENCES, type Locale, type ThemePreference } from '@provecheck/shared';
import { Globe, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { OptionMenu } from './OptionMenu';

const LANGUAGE_NAMES: Record<Locale, string> = { 'es-UY': 'Español', en: 'English' };
const THEME_ICON: Record<ThemePreference, LucideIcon> = { light: Sun, dark: Moon, system: Monitor };

/** Compact theme and language menus (spec 16): for logged-out screens and the user menu. */
export function PreferenceControls(props: {
  theme: ThemePreference;
  locale: Locale;
  onTheme: (t: ThemePreference) => void;
  onLocale: (l: Locale) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="prefs">
      <OptionMenu
        label={t('prefs.theme')}
        value={props.theme}
        onChange={props.onTheme}
        options={THEME_PREFERENCES.map((v) => ({
          value: v,
          label: t(`prefs.${v}`),
          icon: THEME_ICON[v],
        }))}
      />
      <OptionMenu
        label={t('prefs.language')}
        value={props.locale}
        onChange={props.onLocale}
        options={LOCALES.map((v) => ({ value: v, label: LANGUAGE_NAMES[v], icon: Globe }))}
      />
    </div>
  );
}
