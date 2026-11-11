import { ApiRequestError, type ServiceTypeDto } from '@provecheck/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Plus, Power, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { errorMessage } from '../auth/errors';

export function ServiceTypesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({ queryKey: ['service-types'], queryFn: () => api.serviceTypes.list() });
  const items = list.data?.items ?? [];

  const mutate = useMutation({
    mutationFn: (run: () => Promise<ServiceTypeDto>) => run(),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['service-types'] });
    },
    onError: (err) =>
      setError(
        err instanceof ApiRequestError && err.code === 'NAME_TAKEN'
          ? t('serviceTypes.nameTaken')
          : errorMessage(t, err),
      ),
  });

  function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    mutate.mutate(() => api.serviceTypes.create(name), { onSuccess: () => setName('') });
  }
  function rename(e: FormEvent) {
    e.preventDefault();
    if (!editing?.name.trim()) return;
    mutate.mutate(() => api.serviceTypes.update(editing.id, { name: editing.name }), {
      onSuccess: () => setEditing(null),
    });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('serviceTypes.title')}</h1>
          <p className="page-sub">{t('serviceTypes.subtitle')}</p>
        </div>
      </div>

      <form className="inline-form" onSubmit={add}>
        <label htmlFor="service-type-name" className="label">
          {t('serviceTypes.new')}
        </label>
        <input
          id="service-type-name"
          className="plain-input"
          value={name}
          maxLength={80}
          placeholder={t('serviceTypes.namePlaceholder')}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
        <button
          type="submit"
          className="primary inline"
          disabled={!name.trim() || mutate.isPending}
        >
          <Plus size={18} aria-hidden /> {t('serviceTypes.add')}
        </button>
      </form>
      <p role="alert" className="form-error">
        {error ?? ''}
      </p>

      <div className="table-card">
        <table className="table">
          <thead>
            <tr>
              {(['name', 'status', 'actions'] as const).map((c) => (
                <th key={c} scope="col" className={c === 'actions' ? 'right' : undefined}>
                  {t(`serviceTypes.col.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className={s.active ? undefined : 'muted-row'}>
                <td data-label={t('serviceTypes.col.name')} className="strong">
                  {editing?.id === s.id ? (
                    <form className="inline-form" onSubmit={rename}>
                      <input
                        className="plain-input"
                        aria-label={t('serviceTypes.name')}
                        value={editing.name}
                        maxLength={80}
                        onChange={(e) => setEditing({ id: s.id, name: e.target.value })}
                        autoFocus
                      />
                      <button
                        type="submit"
                        className="icon-button ok"
                        title={t('serviceTypes.save')}
                        aria-label={t('serviceTypes.save')}
                      >
                        <Check size={18} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        title={t('common.cancel')}
                        aria-label={t('common.cancel')}
                        onClick={() => setEditing(null)}
                      >
                        <X size={18} aria-hidden />
                      </button>
                    </form>
                  ) : (
                    s.name
                  )}
                </td>
                <td data-label={t('serviceTypes.col.status')}>
                  <span className={`chip status-${s.active ? 'active' : 'inactive'}`}>
                    {t(s.active ? 'serviceTypes.active' : 'serviceTypes.inactive')}
                  </span>
                </td>
                <td className="actions">
                  <button
                    className="icon-button"
                    title={t('serviceTypes.action.rename')}
                    aria-label={`${t('serviceTypes.action.rename')}: ${s.name}`}
                    onClick={() => setEditing({ id: s.id, name: s.name })}
                  >
                    <Pencil size={18} aria-hidden />
                  </button>
                  <button
                    className={`icon-button ${s.active ? 'danger-hover' : 'ok'}`}
                    title={t(
                      s.active
                        ? 'serviceTypes.action.deactivate'
                        : 'serviceTypes.action.reactivate',
                    )}
                    aria-label={`${t(s.active ? 'serviceTypes.action.deactivate' : 'serviceTypes.action.reactivate')}: ${s.name}`}
                    onClick={() =>
                      mutate.mutate(() => api.serviceTypes.update(s.id, { active: !s.active }))
                    }
                  >
                    <Power size={18} aria-hidden />
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
        {list.isSuccess && items.length === 0 && (
          <p className="table-state">{t('serviceTypes.empty')}</p>
        )}
      </div>
    </>
  );
}
