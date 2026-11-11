import { LOCALES, THEME_PREFERENCES, type Locale } from '@provecheck/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/theme';
import { Icon } from './Icon';

const LANGUAGE_NAMES: Record<Locale, string> = { 'es-UY': 'Español', en: 'English' };

/** Compact language and theme pills for logged-out screens (M-01 footer). Each tap cycles to the next option. */
export function PreferenceBar({
  locale,
  onLocale,
}: {
  locale: Locale;
  onLocale: (l: Locale) => void;
}) {
  const { t } = useTranslation();
  const { colors, preference, setPreference } = useTheme();
  const nextLocale = LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length]!;
  const nextTheme =
    THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(preference) + 1) % THEME_PREFERENCES.length]!;
  const pill = { borderColor: colors.border, backgroundColor: colors.surface };
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('prefs.language')}: ${LANGUAGE_NAMES[locale]}`}
        onPress={() => onLocale(nextLocale)}
        style={[styles.pill, pill]}
      >
        <Icon name="language" size={18} color={colors.textSecondary} />
        <Text style={{ color: colors.text }}>{LANGUAGE_NAMES[locale]}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('prefs.theme')}: ${t(`prefs.${preference}`)}`}
        onPress={() => setPreference(nextTheme)}
        style={[styles.pill, pill]}
      >
        <Icon
          name={preference === 'light' ? 'lightMode' : 'darkMode'}
          size={18}
          color={colors.textSecondary}
        />
        <Text style={{ color: colors.text }}>{t(`prefs.${preference}`)}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
});
