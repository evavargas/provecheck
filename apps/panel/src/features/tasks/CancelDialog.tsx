import type { TaskDto } from '@provecheck/shared';
import { useMutation } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { Modal } from '../../components/ui/Modal';
import { errorMessage } from '../auth/errors';

export function CancelDialog({
  task,
  onClose,
  onDone,
}: {
  task: TaskDto | null;
  onClose: () => void;
  onDone: (t: TaskDto) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const run = useMutation({
    mutationFn: () => api.tasks.cancel(task!.id, reason),
    onSuccess: (updated) => {
      setReason('');
      onDone(updated);
    },
    onError: (err) => setError(errorMessage(t, err)),
  });
  if (!task) return null;
  return (
    <Modal
      open
      onClose={onClose}
      icon={<TriangleAlert aria-hidden />}
      title={t('tasks.cancel.title')}
      description={t('tasks.cancel.body')}
      footer={
        <>
          <button className="ghost" onClick={onClose}>
            {t('tasks.cancel.back')}
          </button>
          <button
            className="primary inline danger"
            disabled={!reason.trim() || run.isPending}
            onClick={() => run.mutate()}
          >
            {t('tasks.cancel.confirm')}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="cancel-reason">{t('tasks.cancel.reason')}</label>
        <textarea
          id="cancel-reason"
          className="textarea"
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <p role="alert" className="form-error">
        {error ?? ''}
      </p>
    </Modal>
  );
}
