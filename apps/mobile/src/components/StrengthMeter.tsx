import { passwordStrength } from '@provecheck/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/theme';

const BARS = { weak: 1, medium: 2, strong: 3 } as const;

export function StrengthMeter({ password }: { password: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (!password) return null;
  const level = passwordStrength(password);
  const color = level === 'weak' ? colors.error : colors.success;
  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      <View style={styles.head}>
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          {t('auth.firstLogin.strength')}:
        </Text>
        <Text style={[styles.text, { color, fontWeight: '700' }]}>
          {t(`auth.firstLogin.${level}`)}
        </Text>
      </View>
      <View style={styles.bars}>
        {[1, 2, 3].map((n) => (
          <View
            key={n}
            style={[styles.bar, { backgroundColor: n <= BARS[level] ? color : colors.border }]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6, marginTop: 8 },
  head: { flexDirection: 'row', justifyContent: 'space-between' },
  text: { fontSize: 12 },
  bars: { flexDirection: 'row', gap: 6 },
  bar: { flex: 1, height: 6, borderRadius: 999 },
});
