import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { TaskStatusChip } from '../../components/Chip';
import { formatDateTime } from '../../lib/format';
import { ContactActions } from '../objections/ObjectionsPage';

const dayRange = () => {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 24 * 3600 * 1000 - 1);
  return { from: from.toISOString(), to: to.toISOString() };
};

// P-01. shortcut: composed from the list endpoints in the browser; a single `GET /dashboard/home` pays off once the lists grow.
export function HomePage() {
  const { t, i18n } = useTranslation();
  const objections = useQuery({
    queryKey: ['objections', 'open'],
    queryFn: () => api.objections.list({ status: 'open' }),
  });
  const today = useQuery({
    queryKey: ['tasks', 'today'],
    queryFn: () => api.tasks.list({ ...dayRange(), status: ['scheduled', 'on_site'] }),
  });
  const onSite = useQuery({
    queryKey: ['tasks', 'on-site'],
    queryFn: () => api.tasks.list({ status: ['on_site'] }),
  });
  const overdue = useQuery({
    queryKey: ['tasks', 'overdue'],
    queryFn: () =>
      api.tasks.list({
        status: ['scheduled'],
        to: new Date(Date.now() - 3600 * 1000).toISOString(),
      }),
  });

  const names = (task: { assignments: { collaboratorName: string; active: boolean }[] }) =>
    task.assignments
      .filter((a) => a.active)
      .map((a) => a.collaboratorName)
      .join(', ');
  const empty = (text: string) => <p className="hint">{text}</p>;

  return (
    <>
      <h1 className="page-title">{t('panel.home.title')}</h1>

      <section className="home-block">
        <div className="home-head">
          <h2 className="section-title">{t('panelHome.objections')}</h2>
          <Link to="/objections">{t('panelHome.seeAll')}</Link>
        </div>
        {objections.data?.items.length === 0 && empty(t('panelHome.noObjections'))}
        <ul className="assign-list">
          {objections.data?.items.slice(0, 5).map((o) => (
            <li key={o.id} className="assign-item">
              <div>
                <strong>{o.recipient}</strong>
                <p className="hint">
                  {o.address} ·{' '}
                  {o.ageDays === 0
                    ? t('objections.today')
                    : t('objections.ageDays', { count: o.ageDays })}
                </p>
              </div>
              <span>
                <ContactActions o={o} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="home-block">
        <div className="home-head">
          <h2 className="section-title">{t('panelHome.today')}</h2>
          <Link to="/tasks">{t('panelHome.seeAll')}</Link>
        </div>
        {today.data?.items.length === 0 && empty(t('panelHome.noToday'))}
        <ul className="assign-list">
          {today.data?.items.map((k) => (
            <li key={k.id} className="assign-item">
              <div>
                <strong>{formatDateTime(k.scheduledStartAt, i18n.language)}</strong> ·{' '}
                {k.clientCompanyName ?? k.clientUserName}
                <p className="hint">
                  {k.address} · {names(k)}
                </p>
              </div>
              <TaskStatusChip status={k.status} />
            </li>
          ))}
        </ul>
      </section>

      <section className="home-block">
        <h2 className="section-title">{t('panelHome.onSite')}</h2>
        {onSite.data?.items.length === 0 && empty(t('panelHome.noOnSite'))}
        <ul className="assign-list">
          {onSite.data?.items.map((k) => (
            <li key={k.id} className="assign-item">
              <div>
                <strong>{k.address}</strong>
                <p className="hint">{names(k)}</p>
              </div>
              <TaskStatusChip status={k.status} />
            </li>
          ))}
        </ul>
      </section>

      <section className="home-block">
        <h2 className="section-title">{t('panelHome.alerts')}</h2>
        {overdue.data?.items.length === 0 && empty(t('panelHome.noAlerts'))}
        <ul className="assign-list">
          {overdue.data?.items.map((k) => (
            <li key={k.id} className="assign-item">
              {t('panelHome.overdue', { address: k.address })}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
