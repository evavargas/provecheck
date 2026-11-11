import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { OptionMenu } from '../../components/OptionMenu';
import { formatDateTime } from '../../lib/format';

const ALL = 'all';

const Stars = ({ value }: { value: number }) => (
  <span className="stars" role="img" aria-label={`${value}/5`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} size={16} aria-hidden fill={n <= Math.round(value) ? 'currentColor' : 'none'} />
    ))}
  </span>
);

export function RatingsPage() {
  const { t, i18n } = useTranslation();
  const [who, setWho] = useState(ALL);
  const summary = useQuery({ queryKey: ['ratings', 'summary'], queryFn: api.ratings.summary });
  const list = useQuery({
    queryKey: ['ratings', 'list', who],
    queryFn: () => api.ratings.list(who === ALL ? {} : { collaboratorId: who }),
  });
  const people = summary.data?.items ?? [];
  const comments = list.data?.items ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('ratings.title')}</h1>
          <p className="page-sub">{t('ratings.subtitle')}</p>
        </div>
      </div>

      <h2 className="section-title">{t('ratings.summary')}</h2>
      {summary.isSuccess && people.length === 0 && (
        <p className="table-state">{t('ratings.empty')}</p>
      )}
      <div className="rating-cards">
        {people.map((p) => {
          const max = Math.max(...p.distribution, 1);
          return (
            <article key={p.collaboratorId} className="rating-card">
              <h3>{p.collaboratorName}</h3>
              <p className="rating-avg">
                <strong>{p.average.toFixed(1)}</strong> <Stars value={p.average} />
              </p>
              <p className="hint">{t('ratings.count', { count: p.count })}</p>
              <ul className="rating-dist">
                {[5, 4, 3, 2, 1].map((n) => (
                  <li key={n}>
                    <span>{n}</span>
                    <span className="rating-dist-bar" aria-label={t('ratings.stars', { n })}>
                      <span style={{ width: `${(p.distribution[n - 1]! / max) * 100}%` }} />
                    </span>
                    <span>{p.distribution[n - 1]}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      <div className="page-head">
        <h2 className="section-title">{t('ratings.comments')}</h2>
        <OptionMenu
          label={t('ratings.filterCollaborator')}
          value={who}
          onChange={setWho}
          options={[
            { value: ALL, label: t('ratings.all') },
            ...people.map((p) => ({ value: p.collaboratorId, label: p.collaboratorName })),
          ]}
        />
      </div>
      <ul className="assign-list">
        {comments.map((r) => (
          <li key={r.id} className="assign-item">
            <div>
              <strong>{r.collaboratorName}</strong> <Stars value={r.stars} />
              <p>{r.comment ?? <span className="hint">{t('ratings.noComment')}</span>}</p>
              <p className="hint">
                {r.authorName} · {r.address} · {formatDateTime(r.createdAt, i18n.language)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
