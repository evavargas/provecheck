import { OBJECTION_STATUSES, type ObjectionRowDto, type ObjectionStatus } from '@provecheck/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { OptionMenu } from '../../components/OptionMenu';
import { formatDateTime } from '../../lib/format';
import { ObjectionDrawer } from './ObjectionDrawer';

const ALL = 'all';
const digits = (phone: string) => phone.replace(/\D/g, '');

export function ContactActions({ o }: { o: ObjectionRowDto }) {
  const { t } = useTranslation();
  const link = (href: string, label: string, Icon: typeof Phone, external = false) => (
    <a
      className="icon-button"
      href={href}
      title={label}
      aria-label={`${label}: ${o.author.name}`}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      <Icon size={18} aria-hidden />
    </a>
  );
  return (
    <>
      {link(`tel:${o.author.phone}`, t('objections.call'), Phone)}
      {link(`mailto:${o.author.email}`, t('objections.mail'), Mail)}
      {link(
        `https://wa.me/${digits(o.author.phone)}`,
        t('objections.whatsapp'),
        MessageCircle,
        true,
      )}
    </>
  );
}

export function ObjectionsPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [status, setStatus] = useState<ObjectionStatus | typeof ALL>(ALL);
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['objections', status],
    queryFn: () => api.objections.list(status === ALL ? {} : { status }),
  });
  const items = list.data?.items ?? [];
  const age = (d: number) =>
    d === 0 ? t('objections.today') : t('objections.ageDays', { count: d });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('objections.title')}</h1>
          <p className="page-sub">{t('objections.subtitle')}</p>
        </div>
      </div>
      <div className="filters">
        <OptionMenu
          label={t('objections.filterStatus')}
          value={status}
          onChange={setStatus}
          options={[
            { value: ALL, label: t('objections.allStatuses') },
            ...OBJECTION_STATUSES.map((s) => ({ value: s, label: t(`objections.status.${s}`) })),
          ]}
        />
      </div>
      <div className="table-card">
        <table className="table">
          <thead>
            <tr>
              {(['task', 'recipient', 'filed', 'age', 'status', 'actions'] as const).map((c) => (
                <th key={c} scope="col" className={c === 'actions' ? 'right' : undefined}>
                  {t(`objections.col.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.id}>
                <td data-label={t('objections.col.task')} className="strong">
                  {o.address}
                </td>
                <td data-label={t('objections.col.recipient')}>{o.recipient}</td>
                <td data-label={t('objections.col.filed')}>
                  {formatDateTime(o.createdAt, i18n.language)}
                </td>
                <td data-label={t('objections.col.age')}>{age(o.ageDays)}</td>
                <td data-label={t('objections.col.status')}>
                  <span
                    className={`chip ${o.status === 'open' ? 'task-objection_filed' : o.status === 'in_review' ? 'task-in_review' : 'task-resolved'}`}
                  >
                    {t(`objections.status.${o.status}`)}
                  </span>
                </td>
                <td className="actions">
                  <ContactActions o={o} />
                  <button
                    className="ghost"
                    onClick={() => setOpen(o.id)}
                    aria-label={`${t('objections.manage')}: ${o.address}`}
                  >
                    {t('objections.manage')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.isPending && <p className="table-state">{t('common.loading')}</p>}
        {list.isSuccess && items.length === 0 && (
          <p className="table-state">{t('objections.empty')}</p>
        )}
      </div>
      <ObjectionDrawer
        id={open}
        onClose={() => setOpen(null)}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: ['objections'] });
          void qc.invalidateQueries({ queryKey: ['objection', open] });
          void qc.invalidateQueries({ queryKey: ['tasks'] });
        }}
      />
    </>
  );
}
