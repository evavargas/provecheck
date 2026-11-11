import { ApiRequestError, type PendingTaskDto, type UserDto } from '@provecheck/shared';
import { useMutation } from '@tanstack/react-query';
import { TriangleAlert, UserX } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { Modal } from '../../components/ui/Modal';
import { formatDateTime } from '../../lib/format';
import { useSession } from '../../session';
import { errorMessage } from '../auth/errors';

export function DeactivateDialog(props: {
  user: UserDto | null;
  onClose: () => void;
  onDone: (u: UserDto) => void;
}) {
  const { t } = useTranslation();
  const { locale } = useSession();
  const deactivate = useMutation({
    mutationFn: () => api.users.deactivate(props.user!.id),
    onSuccess: props.onDone,
  });
  const { reset } = deactivate;
  useEffect(() => reset(), [props.user, reset]);

  const err = deactivate.error;
  const pending =
    err instanceof ApiRequestError && err.code === 'HAS_PENDING_TASKS'
      ? ((err.details?.tasks as PendingTaskDto[]) ?? [])
      : null;

  return (
    <Modal
      open={!!props.user}
      onClose={props.onClose}
      title={props.user ? t('users.deactivate.title', { name: props.user.name }) : ''}
      icon={
        <span className="badge danger">
          <UserX size={22} aria-hidden />
        </span>
      }
      footer={
        <>
          <button className="ghost" onClick={props.onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="danger"
            disabled={deactivate.isPending || !!pending}
            onClick={() => deactivate.mutate()}
          >
            {t('users.deactivate.confirm')}
          </button>
        </>
      }
    >
      <p>{t('users.deactivate.body')}</p>
      {pending && (
        <div className="callout warning" role="alert">
          <TriangleAlert size={20} aria-hidden />
          <div>
            <strong>{t('users.deactivate.pendingTitle')}</strong>
            <p>{t('users.deactivate.pendingBody')}</p>
            <ul>
              {pending.map((task) => (
                <li key={task.id}>
                  {formatDateTime(task.scheduledStartAt, locale)} · {task.address}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {err && !pending && (
        <p role="alert" className="form-error">
          {errorMessage(t, err)}
        </p>
      )}
    </Modal>
  );
}
