import { LOCALES, THEME_PREFERENCES, type Locale, type ThemePreference } from '@provecheck/shared';
import { Globe, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/theme';
import { OptionMenu } from './OptionMenu';

const LANGUAGE_NAMES: Record<Locale, string> = { 'es-UY': 'Español', en: 'English' };
const THEME_ICON: Record<ThemePreference, LucideIcon> = { light: Sun, dark: Moon, system: Monitor };

/** Compact language and theme menus for logged-out screens (M-01 footer). */
export function PreferenceBar({
  locale,
  onLocale,
}: {
  locale: Locale;
  onLocale: (l: Locale) => void;
}) {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();
  return (
    <View style={styles.row}>
      <OptionMenu
        label={t('prefs.language')}
        value={locale}
        onChange={onLocale}
        options={LOCALES.map((v) => ({ value: v, label: LANGUAGE_NAMES[v], icon: Globe }))}
      />
      <OptionMenu
        label={t('prefs.theme')}
        value={preference}
        onChange={setPreference}
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
