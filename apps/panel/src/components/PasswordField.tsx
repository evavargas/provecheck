import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function PasswordField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  error?: string | undefined;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <div className="input-row">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={props.value}
          autoComplete={props.autoComplete}
          aria-invalid={props.error ? true : undefined}
          onChange={(e) => props.onChange(e.target.value)}
          required
        />
        <button
          type="button"
          className="ghost"
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {t(visible ? 'auth.hide' : 'auth.show')}
        </button>
      </div>
      {props.error && <p className="field-error">{props.error}</p>}
    </div>
  );
}
