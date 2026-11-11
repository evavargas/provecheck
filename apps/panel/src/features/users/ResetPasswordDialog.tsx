import { ApiRequestError, type UserDto } from '@provecheck/shared';
import { useMutation } from '@tanstack/react-query';
import { Info, KeyRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { Modal } from '../../components/ui/Modal';
import { errorMessage } from '../auth/errors';
import { generateTemporaryPassword } from '../../lib/password';
import { PasswordBox } from './PasswordBox';

/** P-08c: the admin copies the new temporary password, then confirms. */
export function ResetPasswordDialog(props: {
  user: UserDto | null;
  onClose: () => void;
  onDone: (u: UserDto) => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  useEffect(() => {
    if (props.user) setPassword(generateTemporaryPassword());
  }, [props.user]);

  const reset = useMutation({
    mutationFn: () => api.users.resetPassword(props.user!.id, password),
    onSuccess: () => props.onDone(props.user!),
  });

  return (
    <Modal
      open={!!props.user}
      onClose={props.onClose}
      title={t('users.reset.title')}
      description={
        props.user && (
          <>
            {props.user.name} <code className="mono-chip">@{props.user.username}</code>
          </>
        )
      }
      icon={
        <span className="badge danger">
          <KeyRound size={22} aria-hidden />
        </span>
      }
      footer={
        <>
          <button className="ghost" onClick={props.onClose}>
            {t('common.cancel')}
          </button>
          <button className="danger" disabled={reset.isPending} onClick={() => reset.mutate()}>
            <KeyRound size={16} aria-hidden /> {t('users.reset.confirm')}
          </button>
        </>
      }
    >
      <p className="callout">
        <Info size={20} aria-hidden /> {t('users.reset.info')}
      </p>
      <div className="field">
        <span className="label">{t('users.reset.password')}</span>
        <PasswordBox value={password} onGenerate={() => setPassword(generateTemporaryPassword())} />
        <p className="hint">{t('users.reset.hint')}</p>
      </div>
      {reset.error && (
        <p role="alert" className="form-error">
          {reset.error instanceof ApiRequestError
            ? errorMessage(t, reset.error)
            : t('errors.INTERNAL')}
        </p>
      )}
    </Modal>
  );
}
