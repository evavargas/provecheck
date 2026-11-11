import { ApiRequestError, type PendingTaskDto, type UserDto } from '@provecheck/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, TriangleAlert, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { SelectField } from '../../components/SelectField';
import { Modal } from '../../components/ui/Modal';
import { formatDateTime } from '../../lib/format';
import { useSession } from '../../session';
import { errorMessage } from '../auth/errors';
import { CreatedDialog } from './CreatedDialog';
import { UserDrawer } from './UserDrawer';

/** P-09: when the collaborator has pending tasks, every one needs a replacement before the deactivation goes through. */
export function DeactivateDialog(props: {
  user: UserDto | null;
  onClose: () => void;
  onDone: (u: UserDto) => void;
}) {
  const { t } = useTranslation();
  const { locale } = useSession();
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<PendingTaskDto[] | null>(null);
  const [created, setCreated] = useState<{ user: UserDto; password: string } | null>(null);

  const deactivate = useMutation({
    mutationFn: () =>
      api.users.deactivate(
        props.user!.id,
        Object.entries(choices).map(([taskId, collaboratorId]) => ({ taskId, collaboratorId })),
      ),
    onSuccess: props.onDone,
    onError: (e) => {
      if (e instanceof ApiRequestError && e.code === 'HAS_PENDING_TASKS') {
        setPending((e.details?.tasks as PendingTaskDto[]) ?? []);
      }
    },
  });
  const { reset } = deactivate;
  useEffect(() => {
    reset();
    setChoices({});
    setPending(null);
  }, [props.user, reset]);

  const err = deactivate.error;
  const showError = err && !(err instanceof ApiRequestError && err.code === 'HAS_PENDING_TASKS');

  const collaborators = useQuery({
    queryKey: ['users', 'collaborators'],
    queryFn: () => api.users.list({ role: 'collaborator', limit: 100 }),
    enabled: !!pending,
  });
  const options = (collaborators.data?.items ?? [])
    .filter((u) => u.status !== 'inactive' && u.id !== props.user?.id)
    .map((u) => ({ value: u.id, label: u.name }));
  const complete = !pending || pending.every((task) => choices[task.id]);

  return (
    <>
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
              disabled={deactivate.isPending || !complete}
              onClick={() => deactivate.mutate()}
            >
              {pending ? t('users.deactivate.confirmReassign') : t('users.deactivate.confirm')}
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
              <p>{t('users.deactivate.pendingBodyWizard')}</p>
            </div>
          </div>
        )}
        {pending && (
          <div className="form-stack">
            {pending.map((task) => (
              <div key={task.id} className="contact-card">
                <p>
                  <strong>{formatDateTime(task.scheduledStartAt, locale)}</strong> · {task.address}
                </p>
                <SelectField
                  label={t('users.deactivate.chooseReplacement')}
                  value={choices[task.id] ?? ''}
                  options={options}
                  onChange={(v) => setChoices((c) => ({ ...c, [task.id]: v }))}
                />
              </div>
            ))}
            <button type="button" className="ghost" onClick={() => setCreating(true)}>
              <Plus size={18} aria-hidden /> {t('users.deactivate.createCollaborator')}
            </button>
            {complete && (
              <p className="hint">
                {t('users.deactivate.impact', { count: pending.length, name: props.user?.name })}
              </p>
            )}
          </div>
        )}
        {showError && (
          <p role="alert" className="form-error">
            {errorMessage(t, err)}
          </p>
        )}
      </Modal>
      <UserDrawer
        mode={creating ? { kind: 'create' } : null}
        onClose={() => setCreating(false)}
        onCreated={(user, password) => {
          setCreating(false);
          setCreated({ user, password });
          void collaborators.refetch();
        }}
        onUpdated={() => undefined}
      />
      <CreatedDialog created={created} onClose={() => setCreated(null)} />
    </>
  );
}
