import { passwordStrength } from '@provecheck/shared';
import { useTranslation } from 'react-i18next';

const BARS = { weak: 1, medium: 2, strong: 3 } as const;

export function StrengthMeter({ password }: { password: string }) {
  const { t } = useTranslation();
  if (!password) return null;
  const level = passwordStrength(password);
  return (
    <div className={`strength ${level}`} role="status">
      <div className="strength-head">
        <span>{t('auth.firstLogin.strength')}:</span>
        <strong>{t(`auth.firstLogin.${level}`)}</strong>
      </div>
      <div className="bars" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} className={n <= BARS[level] ? 'on' : ''} />
        ))}
      </div>
    </div>
  );
}
