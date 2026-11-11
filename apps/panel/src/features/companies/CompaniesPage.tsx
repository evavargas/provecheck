import type { CompanyDto } from '@provecheck/shared';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power, Search, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { OptionMenu } from '../../components/OptionMenu';
import { CompanyDrawer } from './CompanyDrawer';

const ALL = 'all';
type Filter = typeof ALL | 'true' | 'false';

export function CompaniesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [active, setActive] = useState<Filter>(ALL);
  const [drawer, setDrawer] = useState<CompanyDto | 'new' | null>(null);
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
    queryKey: ['companies', 'list', { q, active }],
    queryFn: ({ pageParam }) =>
      api.companies.list({
        q,
        ...(active !== ALL ? { active: active === 'true' } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const companies = list.data?.pages.flatMap((p) => p.items) ?? [];
  const defaultHours = list.data?.pages[0]?.defaultObjectionWindowHours ?? 336;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['companies'] });
  };

  async function toggle(c: CompanyDto) {
    await (c.active ? api.companies.deactivate(c.id) : api.companies.reactivate(c.id));
    setNotice(
      t(c.active ? 'companies.deactivated' : 'companies.reactivated', { name: c.legalName }),
    );
    refresh();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('companies.title')}</h1>
          <p className="page-sub">{t('companies.subtitle')}</p>
        </div>
        <button className="primary inline" onClick={() => setDrawer('new')}>
          <Plus size={18} aria-hidden /> {t('companies.new')}
        </button>
      </div>

      <div className="filters">
        <div className="search">
          <Search size={18} aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('companies.filterSearch')}
            aria-label={t('companies.filterSearch')}
          />
        </div>
        <OptionMenu
          label={t('companies.filterStatus')}
          value={active}
          onChange={setActive}
          options={[
            { value: ALL, label: t('companies.allStatuses') },
            { value: 'true', label: t('companies.active') },
            { value: 'false', label: t('companies.inactive') },
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
                ['legalName', 'address', 'phone', 'email', 'window', 'status', 'actions'] as const
              ).map((c) => (
                <th key={c} scope="col" className={c === 'actions' ? 'right' : undefined}>
                  {t(`companies.col.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className={c.active ? undefined : 'muted-row'}>
                <td data-label={t('companies.col.legalName')} className="strong">
                  {c.legalName}
                </td>
                <td data-label={t('companies.col.address')}>{c.address ?? '—'}</td>
                <td data-label={t('companies.col.phone')}>{c.phone ?? '—'}</td>
                <td data-label={t('companies.col.email')}>{c.email ?? '—'}</td>
                <td data-label={t('companies.col.window')}>
                  {c.objectionWindowHours === null
                    ? t('companies.windowDefault', { hours: defaultHours })
                    : t('companies.windowHours', { hours: c.objectionWindowHours })}
                </td>
                <td data-label={t('companies.col.status')}>
                  <span className={`chip status-${c.active ? 'active' : 'inactive'}`}>
                    {t(c.active ? 'companies.active' : 'companies.inactive')}
                  </span>
                </td>
                <td className="actions">
                  <button
                    className="icon-button"
                    title={t('companies.action.edit')}
                    aria-label={`${t('companies.action.edit')}: ${c.legalName}`}
                    onClick={() => setDrawer(c)}
                  >
                    <Pencil size={18} aria-hidden />
                  </button>
                  <button
                    className={`icon-button ${c.active ? 'danger-hover' : 'ok'}`}
                    title={t(
                      c.active ? 'companies.action.deactivate' : 'companies.action.reactivate',
                    )}
                    aria-label={`${t(c.active ? 'companies.action.deactivate' : 'companies.action.reactivate')}: ${c.legalName}`}
                    onClick={() => void toggle(c)}
                  >
                    {c.active ? <Power size={18} aria-hidden /> : <Undo2 size={18} aria-hidden />}
                  </button>
                </td>
              </tr>
            ))}
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
        {list.isSuccess && companies.length === 0 && (
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

      <CompanyDrawer
        company={drawer}
        defaultHours={defaultHours}
        onClose={() => setDrawer(null)}
        onSaved={(_, created) => {
          setDrawer(null);
          setNotice(t(created ? 'companies.created' : 'companies.updated'));
          refresh();
        }}
      />
    </>
  );
}
