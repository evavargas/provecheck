import { ApiRequestError, type Locale } from '@provecheck/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Icon, LogoMark } from '../../components/Icon';
import { PreferenceBar } from '../../components/PreferenceBar';
import { Screen } from '../../components/Screen';
import { setLocale } from '../../i18n';
import { useTheme } from '../../theme/theme';

export function LoginScreen({ notice }: { notice?: 'notForApp' | undefined }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(notice ? t('auth.notForApp') : null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(identifier, password);
    } catch (err) {
      setError(err instanceof ApiRequestError ? t(`errors.${err.code}`) : t('errors.INTERNAL'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          <PreferenceBar locale={i18n.language as Locale} onLocale={(l) => void setLocale(l)} />
        </View>
      }
    >
      <View style={styles.brand}>
        <LogoMark size={64} />
        <Text style={[styles.name, { color: colors.primary }]}>{t('app.name')}</Text>
        <Text style={{ color: colors.textSecondary }}>{t('auth.appTagline')}</Text>
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={{ gap: 4 }}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            {t('auth.title')}
          </Text>
          <Text style={{ color: colors.textSecondary }}>{t('auth.subtitle')}</Text>
        </View>
        <Field
          label={t('auth.identifier')}
          icon="mail"
          value={identifier}
          onChange={setIdentifier}
          placeholder={t('auth.identifierPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
        />
        <Field
          label={t('auth.password')}
          icon="lock"
          value={password}
          onChange={setPassword}
          placeholder={t('auth.passwordPlaceholder')}
          autoComplete="current-password"
          textContentType="password"
          secret
        />
        {error ? (
          <View style={styles.errorRow} accessibilityLiveRegion="polite">
            <Icon name="error" size={16} color={colors.error} />
            <Text style={{ color: colors.error, flex: 1 }}>{error}</Text>
          </View>
        ) : null}
        <Button
          label={t('auth.submit')}
          onPress={() => void submit()}
          disabled={busy || !identifier || !password}
        />
        <View style={[styles.hint, { backgroundColor: colors.background }]}>
          <Icon name="info" size={18} color={colors.primary} />
          <Text style={{ color: colors.textSecondary, flex: 1, fontSize: 13 }}>
            {t('auth.forgotHint')}
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', gap: 6 },
  name: { fontSize: 28, fontWeight: '700' },
  card: { gap: 16, padding: 20, borderRadius: 12, borderWidth: 1 },
  title: { fontSize: 22, fontWeight: '600' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hint: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 8, alignItems: 'flex-start' },
  footer: { padding: 16 },
});
