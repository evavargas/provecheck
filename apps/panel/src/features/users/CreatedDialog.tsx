import type { UserDto } from '@provecheck/shared';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../components/ui/Modal';
import { PasswordBox } from './PasswordBox';

/** P-08b: the only moment the temporary password is shown. */
export function CreatedDialog({
  created,
  onClose,
}: {
  created: { user: UserDto; password: string } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={!!created}
      onClose={onClose}
      title={t('users.created.title')}
      description={t('users.created.subtitle')}
      icon={
        <span className="badge success">
          <CircleCheck size={22} aria-hidden />
        </span>
      }
      footer={
        <button className="primary" onClick={onClose}>
          {t('common.done')}
        </button>
      }
    >
      {created && (
        <>
          <dl className="summary">
            <div>
              <dt>{t('users.created.user')}</dt>
              <dd>@{created.user.username}</dd>
            </div>
            <div>
              <dt>{t('users.created.email')}</dt>
              <dd>{created.user.email}</dd>
            </div>
          </dl>
          <div className="field">
            <span className="label">{t('users.created.password')}</span>
            <PasswordBox value={created.password} startVisible />
          </div>
          <p className="callout warning">
            <TriangleAlert size={20} aria-hidden /> {t('users.created.warning')}
          </p>
        </>
      )}
    </Modal>
  );
}
