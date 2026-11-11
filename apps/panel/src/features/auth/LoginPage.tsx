import type { LoginResponse } from '@provecheck/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { Field } from '../../components/Field';
import { Icon, LogoMark } from '../../components/Icon';
import { errorMessage } from './errors';

export function LoginPage({ onDone }: { onDone: (r: LoginResponse) => void }) {
  const { t } = useTranslation();
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
      <div className="card-head">
        <LogoMark />
        <h1>{t('auth.panelTitle')}</h1>
        <p>{t('auth.panelSubtitle')}</p>
      </div>
      <Field
        label={t('auth.identifier')}
        icon="person"
        value={identifier}
        onChange={setIdentifier}
        placeholder={t('auth.identifierPlaceholder')}
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
      />
      <Field
        label={t('auth.password')}
        icon="lock"
        value={password}
        onChange={setPassword}
        placeholder={t('auth.passwordPlaceholder')}
        autoComplete="current-password"
        secret
        required
      />
      <p role="alert" className="form-error">
        {error && (
          <>
            <Icon name="error" size={16} /> {error}
          </>
        )}
      </p>
      <button type="submit" className="primary" disabled={busy || !identifier || !password}>
        {t('auth.submit')}
      </button>
      <p className="hint-line">{t('auth.forgotHint')}</p>
    </form>
  );
}
