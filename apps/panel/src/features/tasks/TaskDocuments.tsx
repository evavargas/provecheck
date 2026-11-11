import { emailSchema, type TaskDto } from '@provecheck/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Send, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '@provecheck/shared';
import { api } from '../../api/client';
import { formatDateTime } from '../../lib/format';
import { errorMessage } from '../auth/errors';

/** P-04 "Registro" and "Documento": the record, its photos, the PDF and the mail history with resend (F9, F16). */
export function TaskDocuments({ task }: { task: TaskDto }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const report = useQuery({
    queryKey: ['task-report', task.id],
    queryFn: () => api.taskDocs.report(task.id),
    retry: false,
  });
  const pdf = useQuery({
    queryKey: ['task-pdf', task.id],
    queryFn: () => api.taskDocs.pdf(task.id),
    retry: false,
    refetchInterval: (q) => (q.state.error ? 5000 : false),
  });
  const outbox = useQuery({
    queryKey: ['task-outbox', task.id],
    queryFn: () => api.taskDocs.outbox(task.id),
    refetchInterval: pdf.data ? false : 5000,
  });

  const resend = useMutation({
    mutationFn: () => api.taskDocs.resend(task.id, email.trim() || undefined),
    onSuccess: () => {
      setEmail('');
      setError(null);
      setNotice(t('tasks.docs.resendQueued'));
      setTimeout(() => void qc.invalidateQueries({ queryKey: ['task-outbox', task.id] }), 7000);
    },
    onError: (err) => setError(errorMessage(t, err)),
  });

  if (
    report.isError &&
    !(report.error instanceof ApiRequestError && report.error.code === 'NOT_FOUND')
  ) {
    return <p className="form-error">{errorMessage(t, report.error)}</p>;
  }
  if (!report.data) return null;
  const skipped = outbox.data?.items[0]?.status === 'skipped_no_contact';
  const emailOk = !email.trim() || emailSchema.safeParse(email).success;

  return (
    <>
      <h3 className="section-title">{t('tasks.docs.record')}</h3>
      {/* The HTML is built on the server from escaped text with only p, strong, ul and li (RN-17). */}
      <div className="record" dangerouslySetInnerHTML={{ __html: report.data.html }} />
      {report.data.photos.length > 0 && (
        <div className="photo-grid">
          {report.data.photos.map((p) =>
            p.status === 'expired' || !p.thumbUrl ? (
              <span key={p.id} className="photo-expired">
                {t('tasks.docs.photoExpired')}
              </span>
            ) : (
              <a key={p.id} href={p.originalUrl ?? undefined} target="_blank" rel="noreferrer">
                <img
                  src={p.thumbUrl}
                  alt={`${t('tasks.docs.photo')} ${p.position + 1}`}
                  loading="lazy"
                />
              </a>
            ),
          )}
        </div>
      )}

      <h3 className="section-title">{t('tasks.docs.document')}</h3>
      {pdf.data ? (
        <a className="ghost inline-link" href={pdf.data.url} target="_blank" rel="noreferrer">
          <FileText size={18} aria-hidden /> {t('tasks.docs.pdfOpen')}
        </a>
      ) : (
        <p className="hint">{t('tasks.docs.pdfPending')}</p>
      )}
      {skipped && (
        <div className="callout warning" role="alert">
          <TriangleAlert size={20} aria-hidden />
          <p>{t('tasks.docs.noContactAlert')}</p>
        </div>
      )}
      <h4 className="section-title">{t('tasks.docs.mailHistory')}</h4>
      {outbox.data?.items.length === 0 && <p className="hint">{t('tasks.docs.noMail')}</p>}
      <ul className="assign-list">
        {outbox.data?.items.map((m) => (
          <li key={m.id} className="assign-item">
            <div>
              <strong>{m.recipient ?? '—'}</strong>
              <p className="hint">
                {formatDateTime(m.createdAt, i18n.language)}
                {m.error ? ` · ${m.error}` : ''}
              </p>
            </div>
            <span
              className={`chip ${m.status === 'sent' ? 'task-completed' : m.status === 'failed' ? 'task-objection_filed' : 'task-cancelled'}`}
            >
              {t(`tasks.docs.mail.${m.status}`)}
            </span>
          </li>
        ))}
      </ul>
      {pdf.data && (
        <div className="inline-form">
          <label htmlFor="resend-email" className="label">
            {t('tasks.docs.resendTo')}
          </label>
          <input
            id="resend-email"
            className="plain-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
          <button
            className="primary inline"
            disabled={!emailOk || resend.isPending}
            onClick={() => resend.mutate()}
          >
            <Send size={18} aria-hidden /> {t('tasks.docs.resendConfirm')}
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="hint">
          {notice}
        </p>
      )}
      <p role="alert" className="form-error">
        {error ?? ''}
      </p>
    </>
  );
}
