import { MIN_PASSWORD_LENGTH, ApiRequestError, type MeDto } from '@provecheck/shared';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { PasswordField } from '../../components/PasswordField';
import { errorMessage } from './errors';

export function FirstLoginPage({ user, onDone }: { user: MeDto; onDone: (u: MeDto) => void }) {
  const { t } = useTranslation();
  const emailId = useId();
  const confirmId = useId();
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = repeat.length > 0 && repeat !== password;
  const valid = email && password.length >= MIN_PASSWORD_LENGTH && repeat === password && confirmed;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await api.firstLogin({ email, newPassword: password }));
    } catch (err) {
      const sameAsTemporary =
        err instanceof ApiRequestError && err.details?.reason === 'same_as_temporary';
      setError(sameAsTemporary ? t('auth.firstLogin.sameAsTemporary') : errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h1>{t('auth.firstLogin.title')}</h1>
      <div className="field">
        <label htmlFor={emailId}>{t('auth.firstLogin.email')}</label>
        <input
          id={emailId}
          type="email"
          value={email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <PasswordField
        label={t('auth.firstLogin.newPassword')}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        error={tooShort ? t('auth.firstLogin.tooShort') : undefined}
      />
      <PasswordField
        label={t('auth.firstLogin.repeatPassword')}
        value={repeat}
        onChange={setRepeat}
        autoComplete="new-password"
        error={mismatch ? t('auth.firstLogin.mismatch') : undefined}
      />
      <div className="check">
        <input
          id={confirmId}
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <label htmlFor={confirmId}>{t('auth.firstLogin.confirmEmail')}</label>
      </div>
      <p role="alert" className="form-error">
        {error}
      </p>
      <button type="submit" className="primary" disabled={busy || !valid}>
        {t('auth.firstLogin.submit')}
      </button>
    </form>
  );
}
