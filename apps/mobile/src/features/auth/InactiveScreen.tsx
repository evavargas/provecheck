import { UserX } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { useTheme } from '../../theme/theme';

/** M-02: the administrator deactivated this account. */
export function InactiveScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { signOut } = useAuth();
  return (
    <Screen
      footer={
        <View style={styles.footer}>
          <Button variant="outline" label={t('common.logout')} onPress={() => void signOut()} />
        </View>
      }
    >
      <View style={styles.center}>
        <View style={[styles.badge, { backgroundColor: colors.border }]}>
          <UserX size={32} color={colors.textSecondary} />
        </View>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {t('auth.inactive.title')}
        </Text>
        <Text style={{ color: colors.textSecondary }}>{t('auth.inactive.body')}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: 12 },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  footer: { padding: 16 },
});
