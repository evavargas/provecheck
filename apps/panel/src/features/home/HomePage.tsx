import { useTranslation } from 'react-i18next';

// Placeholder until P-01 exists.
export function HomePage() {
  const { t } = useTranslation();
  return <h1 className="page-title">{t('panel.home.title')}</h1>;
}
