import { Copy, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Read-only temporary password with show/hide, copy and (optionally) generate. */
export function PasswordBox(props: {
  value: string;
  onGenerate?: () => void;
  startVisible?: boolean;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(props.startVisible ?? false);
  const [copied, setCopied] = useState(false);
  const Eyes = visible ? EyeOff : Eye;

  async function copy() {
    await navigator.clipboard.writeText(props.value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="password-box">
      <input
        readOnly
        value={props.value}
        type={visible ? 'text' : 'password'}
        aria-label={t('users.form.tempPassword')}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button
        type="button"
        className="ghost"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={t(visible ? 'users.form.hidePassword' : 'users.form.showPassword')}
      >
        <Eyes size={18} aria-hidden />
      </button>
      <button
        type="button"
        className="ghost"
        onClick={() => void copy()}
        aria-label={t('users.form.copyPassword')}
      >
        <Copy size={18} aria-hidden />
        <span className="sr-only" role="status">
          {copied ? t('common.copied') : ''}
        </span>
      </button>
      {props.onGenerate && (
        <button type="button" className="ghost" onClick={props.onGenerate}>
          <RefreshCw size={16} aria-hidden /> {t('users.form.generate')}
        </button>
      )}
    </div>
  );
}
