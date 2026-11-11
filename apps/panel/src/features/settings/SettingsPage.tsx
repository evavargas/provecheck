import {
  LOCALES,
  LOGO_TYPES,
  MAX_LOGO_BYTES,
  TIMEZONES,
  type Locale,
  type OrganizationDto,
} from '@provecheck/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Mail, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { Field } from '../../components/Field';
import { SelectField } from '../../components/SelectField';
import { errorMessage } from '../auth/errors';
import { Building2, Clock } from 'lucide-react';

export function SettingsPage() {
  const q = useQuery({ queryKey: ['organization'], queryFn: api.organization.get });
  return q.data ? <Form key={q.data.id} org={q.data} /> : <p className="table-state">…</p>;
}

function Form({ org }: { org: OrganizationDto }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(org.name);
  const [timezone, setTimezone] = useState(org.timezone);
  const [locale, setLocale] = useState<Locale>(org.defaultLocale);
  const [hours, setHours] = useState(String(org.defaultObjectionWindowHours));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const hoursNumber = Number(hours);
  const hoursValid = Number.isInteger(hoursNumber) && hoursNumber >= 1 && hoursNumber <= 8760;
  const dirty =
    name !== org.name ||
    timezone !== org.timezone ||
    locale !== org.defaultLocale ||
    hoursNumber !== org.defaultObjectionWindowHours;
  const refresh = (next: OrganizationDto) => qc.setQueryData(['organization'], next);

  const save = useMutation({
    mutationFn: () =>
      api.organization.update({
        name,
        timezone: timezone as (typeof TIMEZONES)[number],
        defaultLocale: locale,
        defaultObjectionWindowHours: hoursNumber,
      }),
    onSuccess: (next) => {
      refresh(next);
      setMessage({ ok: true, text: t('settings.saved') });
    },
    onError: (err) => setMessage({ ok: false, text: errorMessage(t, err) }),
  });

  const upload = useMutation({
    mutationFn: async (f: File) => {
      const contentType = f.type as (typeof LOGO_TYPES)[number];
      const { uploadUrl } = await api.organization.presignLogo({ contentType, bytes: f.size });
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': contentType },
        body: f,
      });
      if (!put.ok) throw new Error('upload failed');
      return api.organization.confirmLogo(contentType);
    },
    onSuccess: (next) => {
      refresh(next);
      setMessage(null);
    },
    onError: (err) => setMessage({ ok: false, text: errorMessage(t, err) }),
  });
  const remove = useMutation({ mutationFn: api.organization.removeLogo, onSuccess: refresh });

  function pick(f: File | undefined) {
    if (!f) return;
    if (!(LOGO_TYPES as readonly string[]).includes(f.type) || f.size > MAX_LOGO_BYTES) {
      setMessage({ ok: false, text: t('settings.logoInvalid') });
      return;
    }
    upload.mutate(f);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('settings.title')}</h1>
          <p className="page-sub">{t('settings.subtitle')}</p>
        </div>
      </div>
      <div className="settings-grid">
        <form
          className="form-stack settings-card"
          onSubmit={(e) => {
            e.preventDefault();
            setMessage(null);
            save.mutate();
          }}
          noValidate
        >
          <Field
            label={t('settings.name')}
            icon={Building2}
            value={name}
            onChange={setName}
            autoComplete="off"
            required
          />
          <SelectField
            label={t('settings.timezone')}
            value={timezone}
            options={TIMEZONES.map((z) => ({ value: z, label: t(`settings.tz.${z}`) }))}
            onChange={setTimezone}
          />
          <SelectField
            label={t('settings.locale')}
            value={locale}
            hint={t('settings.localeHint')}
            options={LOCALES.map((l) => ({ value: l, label: t(`settings.localeNames.${l}`) }))}
            onChange={(v) => setLocale(v as Locale)}
          />
          <div>
            <Field
              label={t('settings.window')}
              icon={Clock}
              inputMode="numeric"
              value={hours}
              onChange={(v) => setHours(v.replace(/\D/g, ''))}
              error={hoursValid ? undefined : t('settings.windowInvalid')}
              autoComplete="off"
            />
            <p className="hint">{t('settings.windowHint')}</p>
          </div>
          {message && (
            <p
              role={message.ok ? 'status' : 'alert'}
              className={message.ok ? 'hint' : 'form-error'}
            >
              {message.text}
            </p>
          )}
          <button
            type="submit"
            className="primary inline"
            disabled={!dirty || !name.trim() || !hoursValid || save.isPending}
          >
            {t('settings.save')}
          </button>
        </form>

        <div className="settings-card form-stack">
          <h2 className="section-title">{t('settings.logo')}</h2>
          {org.logoUrl ? (
            <img className="logo-preview" src={org.logoUrl} alt={t('settings.logo')} />
          ) : (
            <p className="hint">{t('settings.none')}</p>
          )}
          <p className="hint">{t('settings.logoHint')}</p>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <div className="inline-form">
            <button
              className="ghost"
              onClick={() => file.current?.click()}
              disabled={upload.isPending}
            >
              <ImagePlus size={18} aria-hidden />{' '}
              {org.logoUrl ? t('settings.logoReplace') : t('settings.logoUpload')}
            </button>
            {org.logoUrl && (
              <button
                className="ghost danger-hover"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
              >
                <Trash2 size={18} aria-hidden /> {t('settings.logoRemove')}
              </button>
            )}
          </div>

          <h2 className="section-title">{t('settings.mail')}</h2>
          <p className={`callout ${org.mail.configured ? '' : 'warning'}`}>
            <Mail size={18} aria-hidden />{' '}
            {org.mail.configured
              ? t('settings.mailOk', { from: org.mail.from })
              : t('settings.mailMissing')}
          </p>
        </div>
      </div>
    </>
  );
}
