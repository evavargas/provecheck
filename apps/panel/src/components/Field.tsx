import { CircleAlert, Eye, EyeOff, type LucideIcon } from 'lucide-react';
import { useId, useState, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'id'> {
  label: string;
  icon: LucideIcon;
  value: string;
  onChange: (v: string) => void;
  error?: string | undefined;
  /** Adds the show/hide eye (password fields). */
  secret?: boolean;
}

export function Field({
  label,
  icon: LeadIcon,
  value,
  onChange,
  error,
  secret,
  ...rest
}: FieldProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const id = useId();
  const Eyes = visible ? EyeOff : Eye;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={`input-wrap${error ? ' invalid' : ''}`}>
        <span className="lead">
          <LeadIcon size={20} aria-hidden />
        </span>
        <input
          {...rest}
          id={id}
          type={secret ? (visible ? 'text' : 'password') : rest.type}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {secret && (
          <button
            type="button"
            className="icon-button trail"
            aria-label={t(visible ? 'auth.hide' : 'auth.show')}
            aria-pressed={visible}
            onClick={() => setVisible((v) => !v)}
          >
            <Eyes size={20} aria-hidden />
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-err`} className="field-error">
          <CircleAlert size={16} aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}
