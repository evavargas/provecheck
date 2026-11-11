import { ApiRequestError, MIN_PASSWORD_LENGTH, type Locale } from '@provecheck/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Icon, LogoMark } from '../../components/Icon';
import { PreferenceBar } from '../../components/PreferenceBar';
import { Screen } from '../../components/Screen';
import { StrengthMeter } from '../../components/StrengthMeter';
import { setLocale } from '../../i18n';
import { useTheme } from '../../theme/theme';

/** M-04: mandatory screen, no way back except signing out. */
export function FirstLoginScreen({ email: initialEmail }: { email: string }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { completeFirstLogin } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [apiError, setApiError] = useState<{
    field: 'email' | 'password' | 'form';
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = repeat.length > 0 && repeat !== password;
  const valid =
    !!email && password.length >= MIN_PASSWORD_LENGTH && repeat === password && confirmed;

  async function submit() {
    setBusy(true);
    setApiError(null);
    try {
      await completeFirstLogin(email.trim().toLowerCase(), password);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'IDENTIFIER_TAKEN') {
        setApiError({ field: 'email', message: t('auth.firstLogin.emailTaken') });
      } else if (err instanceof ApiRequestError && err.details?.reason === 'same_as_temporary') {
        setApiError({ field: 'password', message: t('auth.firstLogin.sameAsTemporary') });
      } else {
        setApiError({
          field: 'form',
          message: err instanceof ApiRequestError ? t(`errors.${err.code}`) : t('errors.INTERNAL'),
        });
      }
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
      <View style={{ gap: 8 }}>
        <LogoMark size={44} />
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {t('auth.firstLogin.title')}
        </Text>
        <Text style={{ color: colors.textSecondary }}>{t('auth.firstLogin.subtitle')}</Text>
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Field
          label={t('auth.firstLogin.email')}
          icon="mail"
          value={email}
          onChange={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          error={apiError?.field === 'email' ? apiError.message : undefined}
        />
        <View>
          <Field
            label={t('auth.firstLogin.newPassword')}
            icon="lock"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            textContentType="newPassword"
            secret
            error={
              tooShort
                ? t('auth.firstLogin.tooShort')
                : apiError?.field === 'password'
                  ? apiError.message
                  : undefined
            }
          />
          <StrengthMeter password={password} />
        </View>
        <Field
          label={t('auth.firstLogin.repeatPassword')}
          icon="lock"
          value={repeat}
          onChange={setRepeat}
          autoComplete="new-password"
          textContentType="newPassword"
          secret
          error={mismatch ? t('auth.firstLogin.mismatch') : undefined}
        />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmed }}
          onPress={() => setConfirmed((c) => !c)}
          style={styles.check}
        >
          <View
            style={[
              styles.box,
              {
                borderColor: colors.border,
                backgroundColor: confirmed ? colors.primary : colors.surface,
              },
            ]}
          >
            {confirmed ? (
              <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>✓</Text>
            ) : null}
          </View>
          <Text style={{ color: colors.text, flex: 1 }}>{t('auth.firstLogin.confirmEmail')}</Text>
        </Pressable>
        {apiError?.field === 'form' ? (
          <View style={styles.errorRow} accessibilityLiveRegion="polite">
            <Icon name="error" size={16} color={colors.error} />
            <Text style={{ color: colors.error, flex: 1 }}>{apiError.message}</Text>
          </View>
        ) : null}
        <Button
          label={t('auth.firstLogin.submit')}
          onPress={() => void submit()}
          disabled={busy || !valid}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '600' },
  card: { gap: 16, padding: 20, borderRadius: 12, borderWidth: 1 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footer: { padding: 16 },
});
