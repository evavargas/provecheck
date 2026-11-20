import { LOCALES, THEME_PREFERENCES, type Locale, type ThemePreference } from '@provecheck/shared';
import { Globe, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { useTheme } from '../theme/theme';
import { OptionMenu } from './OptionMenu';

const LANGUAGE_NAMES: Record<Locale, string> = { 'es-UY': 'Español', en: 'English' };
const THEME_ICON: Record<ThemePreference, LucideIcon> = { light: Sun, dark: Moon, system: Monitor };

/** Language and theme menus. Once signed in, a change is also saved to the profile (RN-29). */
export function PreferenceBar({
  locale,
  onLocale,
}: {
  locale: Locale;
  onLocale: (l: Locale) => void;
}) {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();
  const { state } = useAuth();
  // shortcut: a failed save (no connection) is ignored; the choice still applies on this phone and the profile keeps the old one.
  const save = (input: { theme?: ThemePreference; locale?: Locale }) => {
    if (state.status === 'ready') void api.updatePreferences(input).catch(() => undefined);
  };
  return (
    <View style={styles.row}>
      <OptionMenu
        label={t('prefs.language')}
        value={locale}
        onChange={(l) => {
          onLocale(l);
          save({ locale: l });
        }}
        options={LOCALES.map((v) => ({ value: v, label: LANGUAGE_NAMES[v], icon: Globe }))}
      />
      <OptionMenu
        label={t('prefs.theme')}
        value={preference}
        onChange={(p) => {
          setPreference(p);
          save({ theme: p });
        }}
        options={THEME_PREFERENCES.map((v) => ({
          value: v,
          label: t(`prefs.${v}`),
          icon: THEME_ICON[v],
        }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
});
