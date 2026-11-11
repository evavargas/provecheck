import type { UserRole, UserStatus } from '@provecheck/shared';
import { useTranslation } from 'react-i18next';

// Tonal chips (spec 16.1): colors live in styles.css per theme.
export const RoleChip = ({ role, company }: { role: UserRole; company?: string | null }) => {
  const { t } = useTranslation();
  return (
    <span className={`chip role-${role}`}>
      {t(`roles.${role}`)}
      {company ? ` (${company})` : ''}
    </span>
  );
};

export const StatusChip = ({ status }: { status: UserStatus }) => {
  const { t } = useTranslation();
  return <span className={`chip status-${status}`}>{t(`status.${status}`)}</span>;
};
