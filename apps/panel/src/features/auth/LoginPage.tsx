import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { PasswordField } from '../../components/PasswordField';
import { errorMessage } from './errors';
import type { LoginResponse } from '@provecheck/shared';

export function LoginPage({ onDone }: { onDone: (r: LoginResponse) => void }) {
  const { t } = useTranslation();
  const idField = useId();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await api.login({ identifier, password }));
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h1>{t('auth.title')}</h1>
      <div className="field">
        <label htmlFor={idField}>{t('auth.identifier')}</label>
        <input
          id={idField}
          value={identifier}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
      </div>
      <PasswordField
        label={t('auth.password')}
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
      />
      <p role="alert" className="form-error">
        {error}
      </p>
      <button type="submit" className="primary" disabled={busy || !identifier || !password}>
        {t('auth.submit')}
      </button>
      <p className="hint">{t('auth.forgotHint')}</p>
    </form>
  );
}
