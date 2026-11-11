import { type IconName } from '@provecheck/shared';
import { useId, useState, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'id'> {
  label: string;
  icon: IconName;
  value: string;
  onChange: (v: string) => void;
  error?: string | undefined;
  /** Adds the show/hide toggle (password fields). */
  secret?: boolean;
}

export function Field({ label, icon, value, onChange, error, secret, ...rest }: FieldProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={`input-wrap${error ? ' invalid' : ''}`}>
        <span className="lead">
          <Icon name={icon} />
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
            <Icon name={visible ? 'visibilityOff' : 'visibility'} />
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-err`} className="field-error">
          <Icon name="error" size={16} /> {error}
        </p>
      )}
    </div>
  );
}
