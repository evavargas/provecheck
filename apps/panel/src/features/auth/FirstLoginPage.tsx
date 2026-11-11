import { ApiRequestError, MIN_PASSWORD_LENGTH, type MeDto } from '@provecheck/shared';
import { Lock, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { CheckboxField } from '../../components/CheckboxField';
import { Field } from '../../components/Field';
import { LogoMark } from '../../components/Icon';
import { StrengthMeter } from '../../components/StrengthMeter';
import { errorMessage } from './errors';

export function FirstLoginPage({ user, onDone }: { user: MeDto; onDone: (u: MeDto) => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState(user.email);
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
  const valid = email && password.length >= MIN_PASSWORD_LENGTH && repeat === password && confirmed;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setApiError(null);
    try {
      onDone(await api.firstLogin({ email, newPassword: password }));
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'IDENTIFIER_TAKEN') {
        setApiError({ field: 'email', message: t('auth.firstLogin.emailTaken') });
      } else if (err instanceof ApiRequestError && err.details?.reason === 'same_as_temporary') {
        setApiError({ field: 'password', message: t('auth.firstLogin.sameAsTemporary') });
      } else {
        setApiError({ field: 'form', message: errorMessage(t, err) });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card-head left">
        <LogoMark size={40} />
        <h1>{t('auth.firstLogin.title')}</h1>
        <p>{t('auth.firstLogin.subtitle')}</p>
      </div>
      <Field
        label={t('auth.firstLogin.email')}
        icon={Mail}
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        error={apiError?.field === 'email' ? apiError.message : undefined}
        required
      />
      <div>
        <Field
          label={t('auth.firstLogin.newPassword')}
          icon={Lock}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          secret
          required
          error={
            tooShort
              ? t('auth.firstLogin.tooShort')
              : apiError?.field === 'password'
                ? apiError.message
                : undefined
          }
        />
        <StrengthMeter password={password} />
      </div>
      <Field
        label={t('auth.firstLogin.repeatPassword')}
        icon={Lock}
        value={repeat}
        onChange={setRepeat}
        autoComplete="new-password"
        secret
        required
        error={mismatch ? t('auth.firstLogin.mismatch') : undefined}
      />
      <CheckboxField
        label={t('auth.firstLogin.confirmEmail')}
        checked={confirmed}
        onChange={setConfirmed}
      />
      <p role="alert" className="form-error">
        {apiError?.field === 'form' ? apiError.message : ''}
      </p>
      <button type="submit" className="primary" disabled={busy || !valid}>
        {t('auth.firstLogin.submit')}
      </button>
    </form>
  );
}
