import {
  OBJECTION_STATUSES,
  type ObjectionDetailDto,
  type ObjectionStatus,
} from '@provecheck/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { TaskStatusChip } from '../../components/Chip';
import { SelectField } from '../../components/SelectField';
import { Modal } from '../../components/ui/Modal';
import { formatDateTime } from '../../lib/format';
import { errorMessage } from '../auth/errors';

export function ObjectionDrawer(props: {
  id: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const q = useQuery({
    queryKey: ['objection', props.id],
    queryFn: () => api.objections.get(props.id!),
    enabled: !!props.id,
  });
  if (!props.id) return null;
  return (
    <Modal variant="drawer" open onClose={props.onClose} title="" footer={null}>
      {q.data ? (
        <Form key={q.data.id} data={q.data} {...props} />
      ) : (
        <p className="table-state">…</p>
      )}
    </Modal>
  );
}

function Form({
  data,
  onClose,
  onSaved,
}: {
  data: ObjectionDetailDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<ObjectionStatus>(data.status);
  const [notes, setNotes] = useState(data.internalNotes ?? '');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const save = useMutation({
    mutationFn: () => api.objections.update(data.id, { status, internalNotes: notes }),
    onSuccess: () => {
      setMessage({ ok: true, text: t('objections.detail.saved') });
      onSaved();
    },
    onError: (err) => setMessage({ ok: false, text: errorMessage(t, err) }),
  });
  const row = (label: string, value: React.ReactNode) => (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
  const dirty = status !== data.status || notes !== (data.internalNotes ?? '');

  return (
    <>
      <h2 className="modal-title-text">{t('objections.detail.title')}</h2>
      <dl className="detail-grid">
        {row(t('objections.detail.task'), `${data.recipient} · ${data.address}`)}
        {row(t('tasks.col.start'), formatDateTime(data.scheduledStartAt, i18n.language))}
        {row(t('objections.detail.taskStatus'), <TaskStatusChip status={data.taskStatus} />)}
        {row(t('objections.col.filed'), formatDateTime(data.createdAt, i18n.language))}
        {row(
          t('objections.detail.author'),
          <>
            {data.author.name} · <a href={`tel:${data.author.phone}`}>{data.author.phone}</a> ·{' '}
            <a href={`mailto:${data.author.email}`}>{data.author.email}</a>
          </>,
        )}
      </dl>
      <h3 className="section-title">{t('objections.detail.text')}</h3>
      <p className="pre-wrap">{data.description}</p>
      {data.attachments.length > 0 && (
        <>
          <h3 className="section-title">{t('objections.detail.images')}</h3>
          <div className="photo-grid">
            {data.attachments.map((a) =>
              a.thumbUrl ? (
                <a key={a.id} href={a.originalUrl ?? undefined} target="_blank" rel="noreferrer">
                  <img
                    src={a.thumbUrl}
                    alt={`${t('objections.detail.image')} ${a.position + 1}`}
                    loading="lazy"
                  />
                </a>
              ) : (
                <span key={a.id} className="photo-expired">
                  {t('objections.detail.imageExpired')}
                </span>
              ),
            )}
          </div>
        </>
      )}
      <div className="form-stack">
        <SelectField
          label={t('objections.detail.statusLabel')}
          value={status}
          options={OBJECTION_STATUSES.map((s) => ({
            value: s,
            label: t(`objections.status.${s}`),
          }))}
          onChange={(v) => setStatus(v as ObjectionStatus)}
        />
        <div className="field">
          <label htmlFor="objection-notes">{t('objections.detail.notes')}</label>
          <textarea
            id="objection-notes"
            className="textarea"
            rows={4}
            maxLength={4000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <p className="hint">{t('objections.detail.notesHint')}</p>
        </div>
        {message && (
          <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'hint' : 'form-error'}>
            {message.text}
          </p>
        )}
        <div className="modal-foot-inline">
          <button className="ghost" onClick={onClose}>
            {t('common.close')}
          </button>
          <button
            className="primary inline"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            {t('objections.detail.save')}
          </button>
        </div>
      </div>
    </>
  );
}
