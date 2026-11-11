import {
  USER_ROLES,
  USER_STATUSES,
  type UserDto,
  type UserRole,
  type UserStatus,
} from '@provecheck/shared';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, Search, UserCheck, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { RoleChip, StatusChip } from '../../components/Chip';
import { OptionMenu } from '../../components/OptionMenu';
import { CreatedDialog } from './CreatedDialog';
import { DeactivateDialog } from './DeactivateDialog';
import { ResetPasswordDialog } from './ResetPasswordDialog';
import { UserDrawer, type DrawerMode } from './UserDrawer';

const ALL = 'all';

export function UsersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [role, setRole] = useState<UserRole | typeof ALL>(ALL);
  const [status, setStatus] = useState<UserStatus | typeof ALL>(ALL);
  const [drawer, setDrawer] = useState<DrawerMode | null>(null);
  const [created, setCreated] = useState<{ user: UserDto; password: string } | null>(null);
  const [resetting, setResetting] = useState<UserDto | null>(null);
  const [deactivating, setDeactivating] = useState<UserDto | null>(null);
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
    queryKey: ['users', { q, role, status }],
    queryFn: ({ pageParam }) =>
      api.users.list({
        q,
        ...(role !== ALL ? { role } : {}),
        ...(status !== ALL ? { status } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const users = list.data?.pages.flatMap((p) => p.items) ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });

  async function reactivate(user: UserDto) {
    await api.users.reactivate(user.id);
    setNotice(t('users.reactivated', { name: user.name }));
    void refresh();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('users.title')}</h1>
          <p className="page-sub">{t('users.subtitle')}</p>
        </div>
        <button className="primary inline" onClick={() => setDrawer({ kind: 'create' })}>
          <Plus size={18} aria-hidden /> {t('users.new')}
        </button>
      </div>

      <div className="filters">
        <div className="search">
          <Search size={18} aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('users.filterSearch')}
            aria-label={t('users.filterSearch')}
          />
        </div>
        <OptionMenu
          label={t('users.filterRole')}
          value={role}
          onChange={setRole}
          options={[
            { value: ALL, label: t('users.allRoles') },
            ...USER_ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) })),
          ]}
        />
        <OptionMenu
          label={t('users.filterStatus')}
          value={status}
          onChange={setStatus}
          options={[
            { value: ALL, label: t('users.allStatuses') },
            ...USER_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
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
              {(['name', 'username', 'email', 'phone', 'role', 'status', 'actions'] as const).map(
                (c) => (
                  <th key={c} scope="col" className={c === 'actions' ? 'right' : undefined}>
                    {t(`users.col.${c}`)}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.status === 'inactive' ? 'muted-row' : undefined}>
                <td data-label={t('users.col.name')} className="strong">
                  {u.name}
                </td>
                <td data-label={t('users.col.username')} className="mono">
                  @{u.username}
                </td>
                <td data-label={t('users.col.email')}>{u.email}</td>
                <td data-label={t('users.col.phone')}>{u.phone}</td>
                <td data-label={t('users.col.role')}>
                  <RoleChip role={u.role} company={u.clientCompanyName} />
                </td>
                <td data-label={t('users.col.status')}>
                  <StatusChip status={u.status} />
                </td>
                <td className="actions">
                  <button
                    className="icon-button"
                    title={t('users.action.edit')}
                    aria-label={`${t('users.action.edit')}: ${u.name}`}
                    onClick={() => setDrawer({ kind: 'edit', user: u })}
                  >
                    <Pencil size={18} aria-hidden />
                  </button>
                  {u.status === 'inactive' ? (
                    <button
                      className="icon-button ok"
                      title={t('users.action.reactivate')}
                      aria-label={`${t('users.action.reactivate')}: ${u.name}`}
                      onClick={() => void reactivate(u)}
                    >
                      <UserCheck size={18} aria-hidden />
                    </button>
                  ) : (
                    <>
                      <button
                        className="icon-button"
                        title={t('users.action.reset')}
                        aria-label={`${t('users.action.reset')}: ${u.name}`}
                        onClick={() => setResetting(u)}
                      >
                        <KeyRound size={18} aria-hidden />
                      </button>
                      <button
                        className="icon-button danger-hover"
                        title={t('users.action.deactivate')}
                        aria-label={`${t('users.action.deactivate')}: ${u.name}`}
                        onClick={() => setDeactivating(u)}
                      >
                        <UserX size={18} aria-hidden />
                      </button>
                    </>
                  )}
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
        {list.isSuccess && users.length === 0 && (
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

      <UserDrawer
        mode={drawer}
        onClose={() => setDrawer(null)}
        onCreated={(user, password) => {
          setDrawer(null);
          setCreated({ user, password });
          void refresh();
        }}
        onUpdated={() => {
          setDrawer(null);
          setNotice(t('users.updated'));
          void refresh();
        }}
      />
      <CreatedDialog created={created} onClose={() => setCreated(null)} />
      <ResetPasswordDialog
        user={resetting}
        onClose={() => setResetting(null)}
        onDone={(u) => {
          setResetting(null);
          setNotice(t('users.reset.done', { name: u.name }));
          void refresh();
        }}
      />
      <DeactivateDialog
        user={deactivating}
        onClose={() => setDeactivating(null)}
        onDone={(u) => {
          setDeactivating(null);
          setNotice(t('users.deactivate.done', { name: u.name }));
          void refresh();
        }}
      />
    </>
  );
}
