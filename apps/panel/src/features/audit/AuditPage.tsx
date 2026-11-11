import type { AuditEntryDto } from '@provecheck/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { OptionMenu } from '../../components/OptionMenu';
import { formatDateTime } from '../../lib/format';

const ALL = 'all';
const ENTITIES = [
  'task',
  'user',
  'client_company',
  'service_type',
  'objection',
  'organization',
] as const;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const show = (v: unknown) =>
  v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);

/** Short diff: only the keys that differ, as `key: before → after` (spec P-12). Long values are cut. */
function changes(e: AuditEntryDto): string[] {
  const before = isObject(e.before) ? e.before : {};
  const after = isObject(e.after) ? e.after : {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (k) =>
      JSON.stringify(before[k]) !== JSON.stringify(after[k]) &&
      !['assignments', 'createdAt'].includes(k),
  );
  const cut = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}…` : s);
  return keys
    .slice(0, 6)
    .map((k) =>
      k in before
        ? `${k}: ${cut(show(before[k]))} → ${cut(show(after[k]))}`
        : `${k}: ${cut(show(after[k]))}`,
    );
}

export function AuditPage() {
  const { t, i18n } = useTranslation();
  const [entity, setEntity] = useState<string>(ALL);
  const list = useInfiniteQuery({
    queryKey: ['audit', entity],
    queryFn: ({ pageParam }) =>
      api.audit({
        ...(entity !== ALL ? { entity } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const label = (group: 'entities' | 'actions', key: string) =>
    t(`audit.${group}.${key}`, { defaultValue: key });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('audit.title')}</h1>
          <p className="page-sub">{t('audit.subtitle')}</p>
        </div>
      </div>
      <div className="filters">
        <OptionMenu
          label={t('audit.filterEntity')}
          value={entity}
          onChange={setEntity}
          options={[
            { value: ALL, label: t('audit.allEntities') },
            ...ENTITIES.map((e) => ({ value: e, label: label('entities', e) })),
          ]}
        />
      </div>
      <div className="table-card">
        <table className="table">
          <thead>
            <tr>
              {(['when', 'who', 'entity', 'action', 'changes'] as const).map((c) => (
                <th key={c} scope="col">
                  {t(`audit.col.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id}>
                <td data-label={t('audit.col.when')}>
                  {formatDateTime(e.createdAt, i18n.language)}
                </td>
                <td data-label={t('audit.col.who')}>{e.actorName ?? t('audit.system')}</td>
                <td data-label={t('audit.col.entity')}>{label('entities', e.entity)}</td>
                <td data-label={t('audit.col.action')} className="strong">
                  {label('actions', e.action)}
                </td>
                <td data-label={t('audit.col.changes')} className="diff">
                  {changes(e).map((c) => (
                    <div key={c}>{c}</div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.isPending && <p className="table-state">{t('common.loading')}</p>}
        {list.isSuccess && items.length === 0 && <p className="table-state">{t('audit.empty')}</p>}
        {list.hasNextPage && (
          <div className="table-foot">
            <button
              className="ghost"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              {t('audit.loadMore')}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
