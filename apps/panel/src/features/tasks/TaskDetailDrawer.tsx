import type { AssignmentDto, TaskDto } from '@provecheck/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Repeat } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { TaskStatusChip } from '../../components/Chip';
import { SelectField } from '../../components/SelectField';
import { Modal } from '../../components/ui/Modal';
import { formatDateTime, formatMoney } from '../../lib/format';
import { errorMessage } from '../auth/errors';

/** Picks who takes over (or joins) and the fee; used for both reassigning and adding. */
function AssignDialog({
  task,
  replacing,
  onClose,
  onDone,
}: {
  task: TaskDto;
  replacing: AssignmentDto | null;
  onClose: () => void;
  onDone: (t: TaskDto) => void;
}) {
  const { t } = useTranslation();
  const [id, setId] = useState('');
  const [fee, setFee] = useState('');
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['users', 'collaborators'],
    queryFn: () => api.users.list({ role: 'collaborator', limit: 100 }),
  });
  const taken = new Set(task.assignments.filter((a) => a.active).map((a) => a.collaboratorId));
  const choices = (list.data?.items ?? []).filter(
    (u) => u.status !== 'inactive' && !taken.has(u.id),
  );
  const feeValue = fee.trim() === '' ? null : Number(fee.replace(',', '.'));
  const feeBad = feeValue !== null && (Number.isNaN(feeValue) || feeValue < 0);

  const run = useMutation({
    mutationFn: () => {
      const input = { collaboratorId: id, feeUyu: feeValue };
      return replacing
        ? api.tasks.replaceAssignment(task.id, replacing.id, input)
        : api.tasks.addAssignment(task.id, input);
    },
    onSuccess: onDone,
    onError: (err) => setError(errorMessage(t, err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={replacing ? t('tasks.replace.title') : t('tasks.replace.addTitle')}
      description={
        replacing ? t('tasks.replace.subtitle', { name: replacing.collaboratorName }) : undefined
      }
      footer={
        <>
          <button className="ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="primary inline"
            disabled={!id || feeBad || run.isPending}
            onClick={() => run.mutate()}
          >
            {replacing ? t('tasks.replace.confirm') : t('tasks.replace.addConfirm')}
          </button>
        </>
      }
    >
      <div className="form-stack">
        <SelectField
          label={t('tasks.replace.newCollaborator')}
          value={id}
          options={choices.map((u) => ({ value: u.id, label: u.name }))}
          onChange={setId}
        />
        <div className="field">
          <label htmlFor="assign-fee">{t('tasks.form.fee')}</label>
          <input
            id="assign-fee"
            className="plain-input"
            inputMode="decimal"
            value={fee}
            onChange={(e) => setFee(e.target.value.replace(/[^\d.,]/g, ''))}
          />
        </div>
        <p role="alert" className="form-error">
          {error ?? ''}
        </p>
      </div>
    </Modal>
  );
}

export function TaskDetailDrawer({
  task,
  onClose,
  onChanged,
}: {
  task: TaskDto | null;
  onClose: () => void;
  onChanged: (t: TaskDto) => void;
}) {
  const { t, i18n } = useTranslation();
  const [dialog, setDialog] = useState<{ replacing: AssignmentDto | null } | null>(null);
  if (!task) return null;
  const open = task.status === 'scheduled' || task.status === 'on_site';
  const row = (label: string, value: string | null) =>
    value ? (
      <>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </>
    ) : null;

  return (
    <>
      <Modal
        variant="drawer"
        open
        onClose={onClose}
        title={t('tasks.detail.title')}
        description={<TaskStatusChip status={task.status} />}
        footer={
          <button className="ghost" onClick={onClose}>
            {t('common.close')}
          </button>
        }
      >
        <h3 className="section-title">{t('tasks.detail.summary')}</h3>
        <dl className="detail-grid">
          {row(t('tasks.col.recipient'), task.clientCompanyName ?? task.clientUserName)}
          {task.clientCompanyName && row(t('tasks.form.clientUser'), task.clientUserName)}
          {row(t('tasks.col.address'), task.address)}
          {row(t('tasks.col.start'), formatDateTime(task.scheduledStartAt, i18n.language))}
          {row(t('tasks.col.service'), task.serviceTypeName)}
          {row(t('tasks.detail.recipientName'), task.recipientName)}
          {row(t('tasks.form.description'), task.description)}
          {row(t('tasks.detail.instructions'), task.instructions)}
          {task.costUyu !== null &&
            row(t('tasks.detail.cost'), formatMoney(task.costUyu, i18n.language))}
          {task.objectionDeadlineAt &&
            row(
              t('tasks.detail.deadline'),
              formatDateTime(task.objectionDeadlineAt, i18n.language),
            )}
          {row(t('tasks.detail.cancelReason'), task.cancellationReason)}
          {row(t('tasks.detail.created'), formatDateTime(task.createdAt, i18n.language))}
        </dl>

        <h3 className="section-title">{t('tasks.detail.assignments')}</h3>
        <ul className="assign-list">
          {task.assignments.map((a) => (
            <li key={a.id} className={`assign-item${a.active ? '' : ' off'}`}>
              <div>
                <strong>{a.collaboratorName}</strong>
                <p className="hint">
                  {a.arrivedAt
                    ? `${t('tasks.detail.arrived')} ${formatDateTime(a.arrivedAt, i18n.language)}`
                    : t('tasks.detail.notArrived')}
                  {a.attendanceDelayed ? ` · ${t('tasks.detail.delayed')}` : ''}
                  {a.feeUyu !== null
                    ? ` · ${t('tasks.detail.fee')} ${formatMoney(a.feeUyu, i18n.language)}`
                    : ''}
                </p>
              </div>
              {a.active ? (
                open && (
                  <button
                    className="ghost"
                    onClick={() => setDialog({ replacing: a })}
                    aria-label={`${t('tasks.detail.replace')}: ${a.collaboratorName}`}
                  >
                    <Repeat size={18} aria-hidden /> {t('tasks.detail.replace')}
                  </button>
                )
              ) : (
                <span className="chip task-cancelled">{t('tasks.detail.replacedState')}</span>
              )}
            </li>
          ))}
        </ul>
        {open && (
          <button className="ghost" onClick={() => setDialog({ replacing: null })}>
            <Plus size={18} aria-hidden /> {t('tasks.detail.add')}
          </button>
        )}
      </Modal>
      {dialog && (
        <AssignDialog
          task={task}
          replacing={dialog.replacing}
          onClose={() => setDialog(null)}
          onDone={(updated) => {
            setDialog(null);
            onChanged(updated);
          }}
        />
      )}
    </>
  );
}
