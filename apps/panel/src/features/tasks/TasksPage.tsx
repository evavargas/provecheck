import { TASK_STATUSES, type TaskDto, type TaskStatus } from '@provecheck/shared';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Pencil, Plus, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { TaskStatusChip } from '../../components/Chip';
import { OptionMenu } from '../../components/OptionMenu';
import { formatDateTime, formatMoney } from '../../lib/format';
import { CancelDialog } from './CancelDialog';
import { TaskDetailDrawer } from './TaskDetailDrawer';
import { TaskDrawer } from './TaskDrawer';

const ALL = 'all';

export function TasksPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<TaskStatus | typeof ALL>(ALL);
  const [form, setForm] = useState<TaskDto | 'new' | null>(null);
  const [detail, setDetail] = useState<TaskDto | null>(null);
  const [cancelling, setCancelling] = useState<TaskDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(id);
  }, [notice]);

  const list = useInfiniteQuery({
    queryKey: ['tasks', { q, status }],
    queryFn: ({ pageParam }) =>
      api.tasks.list({
        q,
        ...(status !== ALL ? { status: [status] } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const tasks = list.data?.pages.flatMap((p) => p.items) ?? [];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['tasks'] });
  };
  const money = (n: number | null) =>
    n === null ? t('tasks.noCost') : formatMoney(n, i18n.language);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('tasks.title')}</h1>
          <p className="page-sub">{t('tasks.subtitle')}</p>
        </div>
        <button className="primary inline" onClick={() => setForm('new')}>
          <Plus size={18} aria-hidden /> {t('tasks.new')}
        </button>
      </div>

      <div className="filters">
        <div className="search">
          <Search size={18} aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('tasks.filterSearch')}
            aria-label={t('tasks.filterSearch')}
          />
        </div>
        <OptionMenu
          label={t('tasks.filterStatus')}
          value={status}
          onChange={setStatus}
          options={[
            { value: ALL, label: t('tasks.allStatuses') },
            ...TASK_STATUSES.map((s) => ({ value: s, label: t(`taskStatus.${s}`) })),
          ]}
        />
      </div>

      {notice && (
        <p role="status" className="toast">
          {notice}
        </p>
      )}

      <div className="table-card">
        <table className="table">
          <thead>
            <tr>
              {(
                [
                  'start',
                  'recipient',
                  'address',
                  'service',
                  'collaborators',
                  'status',
                  'cost',
                  'actions',
                ] as const
              ).map((c) => (
                <th key={c} scope="col" className={c === 'actions' ? 'right' : undefined}>
                  {t(`tasks.col.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.map((k) => {
              const canEdit = k.status === 'scheduled' || k.status === 'on_site';
              return (
                <tr key={k.id} className={k.status === 'cancelled' ? 'muted-row' : undefined}>
                  <td data-label={t('tasks.col.start')} className="strong">
                    {formatDateTime(k.scheduledStartAt, i18n.language)}
                  </td>
                  <td data-label={t('tasks.col.recipient')}>
                    {k.clientCompanyName ?? k.clientUserName}
                  </td>
                  <td data-label={t('tasks.col.address')}>{k.address}</td>
                  <td data-label={t('tasks.col.service')}>
                    {k.serviceTypeName ?? t('tasks.noService')}
                  </td>
                  <td data-label={t('tasks.col.collaborators')}>
                    {k.assignments
                      .filter((a) => a.active)
                      .map((a) => a.collaboratorName)
                      .join(', ')}
                  </td>
                  <td data-label={t('tasks.col.status')}>
                    <TaskStatusChip status={k.status} />
                  </td>
                  <td data-label={t('tasks.col.cost')}>{money(k.costUyu)}</td>
                  <td className="actions">
                    <button
                      className="icon-button"
                      title={t('tasks.action.view')}
                      aria-label={`${t('tasks.action.view')}: ${k.address}`}
                      onClick={() => setDetail(k)}
                    >
                      <Eye size={18} aria-hidden />
                    </button>
                    {canEdit && (
                      <button
                        className="icon-button"
                        title={t('tasks.action.edit')}
                        aria-label={`${t('tasks.action.edit')}: ${k.address}`}
                        onClick={() => setForm(k)}
                      >
                        <Pencil size={18} aria-hidden />
                      </button>
                    )}
                    {k.status === 'scheduled' && (
                      <button
                        className="icon-button danger-hover"
                        title={t('tasks.action.cancel')}
                        aria-label={`${t('tasks.action.cancel')}: ${k.address}`}
                        onClick={() => setCancelling(k)}
                      >
                        <X size={18} aria-hidden />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.isPending && <p className="table-state">{t('common.loading')}</p>}
        {list.isError && (
          <p className="table-state" role="alert">
            {t('common.error')}{' '}
            <button className="ghost" onClick={() => void list.refetch()}>
              {t('common.retry')}
            </button>
          </p>
        )}
        {list.isSuccess && tasks.length === 0 && (
          <p className="table-state">{t('common.noResults')}</p>
        )}
        {list.hasNextPage && (
          <div className="table-foot">
            <button
              className="ghost"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              {t('common.loadMore')}
            </button>
          </div>
        )}
      </div>

      <TaskDrawer
        task={form}
        onClose={() => setForm(null)}
        onSaved={(_, created) => {
          setForm(null);
          setNotice(t(created ? 'tasks.created' : 'tasks.updated'));
          refresh();
        }}
      />
      <TaskDetailDrawer
        task={detail}
        onClose={() => setDetail(null)}
        onChanged={(updated) => {
          setDetail(updated);
          setNotice(t('tasks.assignmentChanged'));
          refresh();
        }}
      />
      <CancelDialog
        task={cancelling}
        onClose={() => setCancelling(null)}
        onDone={() => {
          setCancelling(null);
          setNotice(t('tasks.cancelled'));
          refresh();
        }}
      />
    </>
  );
}
