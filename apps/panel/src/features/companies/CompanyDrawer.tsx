import { ApiRequestError, emailSchema, type CompanyDto } from '@provecheck/shared';
import { useMutation } from '@tanstack/react-query';
import { Building2, Mail, MapPin, Phone, Plus, Trash2, User } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { Field } from '../../components/Field';
import { Modal } from '../../components/ui/Modal';
import { errorMessage } from '../auth/errors';

type Contact = { name: string; role: string; phone: string; email: string };
const emptyContact = (): Contact => ({ name: '', role: '', phone: '', email: '' });

export function CompanyDrawer(props: {
  company: CompanyDto | 'new' | null;
  defaultHours: number;
  onClose: () => void;
  onSaved: (company: CompanyDto, created: boolean) => void;
}) {
  const { company } = props;
  // Remount per target so the form never carries values over from the previous one.
  return company ? (
    <Form key={company === 'new' ? 'new' : company.id} {...props} company={company} />
  ) : null;
}

function Form({
  company,
  defaultHours,
  onClose,
  onSaved,
}: {
  company: CompanyDto | 'new';
  defaultHours: number;
  onClose: () => void;
  onSaved: (c: CompanyDto, created: boolean) => void;
}) {
  const { t } = useTranslation();
  const editing = company === 'new' ? null : company;
  const [legalName, setLegalName] = useState(editing?.legalName ?? '');
  const [address, setAddress] = useState(editing?.address ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [hours, setHours] = useState(editing?.objectionWindowHours?.toString() ?? '');
  const [contacts, setContacts] = useState<Contact[]>(
    (editing?.contacts ?? []).map((c) => ({
      name: c.name,
      role: c.role ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
    })),
  );
  const [error, setError] = useState<{ field: 'legalName' | 'form'; message: string } | null>(null);

  const hoursNumber = hours.trim() === '' ? null : Number(hours);
  const hoursValid =
    hoursNumber === null ||
    (Number.isInteger(hoursNumber) && hoursNumber >= 1 && hoursNumber <= 8760);
  const emailValid = !email.trim() || emailSchema.safeParse(email).success;
  const contactEmailsValid = contacts.every(
    (c) => !c.email.trim() || emailSchema.safeParse(c.email).success,
  );
  const blocked =
    !legalName.trim() ||
    !hoursValid ||
    !emailValid ||
    !contactEmailsValid ||
    contacts.some((c) => !c.name.trim());

  const save = useMutation({
    mutationFn: () => {
      const body = {
        legalName,
        address,
        phone,
        email,
        notes,
        objectionWindowHours: hoursNumber,
        contacts: contacts.map((c) => ({
          name: c.name,
          role: c.role,
          phone: c.phone,
          email: c.email,
        })),
      };
      return editing ? api.companies.update(editing.id, body) : api.companies.create(body);
    },
    onSuccess: (saved) => onSaved(saved, !editing),
    onError: (err) =>
      setError(
        err instanceof ApiRequestError && err.code === 'NAME_TAKEN'
          ? { field: 'legalName', message: t('companies.form.nameTaken') }
          : { field: 'form', message: errorMessage(t, err) },
      ),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    save.mutate();
  }
  const setContact = (i: number, patch: Partial<Contact>) =>
    setContacts((all) => all.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <Modal
      variant="drawer"
      open
      onClose={onClose}
      title={editing ? t('companies.form.editTitle') : t('companies.form.createTitle')}
      description={editing ? t('companies.form.editSubtitle') : t('companies.form.createSubtitle')}
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="company-form"
            className="primary inline"
            disabled={blocked || save.isPending}
          >
            {editing ? t('common.save') : t('companies.form.create')}
          </button>
        </>
      }
    >
      <form id="company-form" className="form-stack" onSubmit={submit} noValidate>
        <Field
          label={t('companies.form.legalName')}
          icon={Building2}
          value={legalName}
          onChange={setLegalName}
          error={error?.field === 'legalName' ? error.message : undefined}
          autoComplete="off"
          required
        />
        <Field
          label={t('companies.form.address')}
          icon={MapPin}
          value={address}
          onChange={setAddress}
          autoComplete="off"
        />
        <Field
          label={t('companies.form.phone')}
          icon={Phone}
          type="tel"
          value={phone}
          onChange={setPhone}
          autoComplete="off"
        />
        <div>
          <Field
            label={t('companies.form.email')}
            icon={Mail}
            type="email"
            value={email}
            onChange={setEmail}
            error={emailValid ? undefined : t('companies.form.emailFormat')}
            autoComplete="off"
          />
          <p className="hint">{t('companies.form.emailHint')}</p>
        </div>
        <div>
          <Field
            label={t('companies.form.window')}
            icon={Building2}
            inputMode="numeric"
            value={hours}
            onChange={(v) => setHours(v.replace(/\D/g, ''))}
            error={hoursValid ? undefined : t('companies.form.windowInvalid')}
            placeholder={String(defaultHours)}
            autoComplete="off"
          />
          <p className="hint">{t('companies.form.windowHint', { hours: defaultHours })}</p>
        </div>

        <fieldset className="contacts">
          <legend className="label">{t('companies.form.contacts')}</legend>
          {contacts.map((c, i) => (
            <div key={i} className="contact-card">
              <Field
                label={t('companies.form.contactName')}
                icon={User}
                value={c.name}
                onChange={(v) => setContact(i, { name: v })}
                autoComplete="off"
                required
              />
              <Field
                label={t('companies.form.contactRole')}
                icon={User}
                value={c.role}
                onChange={(v) => setContact(i, { role: v })}
                autoComplete="off"
              />
              <Field
                label={t('companies.form.contactPhone')}
                icon={Phone}
                type="tel"
                value={c.phone}
                onChange={(v) => setContact(i, { phone: v })}
                autoComplete="off"
              />
              <Field
                label={t('companies.form.contactEmail')}
                icon={Mail}
                type="email"
                value={c.email}
                onChange={(v) => setContact(i, { email: v })}
                error={
                  !c.email.trim() || emailSchema.safeParse(c.email).success
                    ? undefined
                    : t('companies.form.emailFormat')
                }
                autoComplete="off"
              />
              <button
                type="button"
                className="ghost danger-hover"
                onClick={() => setContacts((all) => all.filter((_, j) => j !== i))}
              >
                <Trash2 size={18} aria-hidden /> {t('companies.form.removeContact')}
              </button>
            </div>
          ))}
          {contacts.length < 20 && (
            <button
              type="button"
              className="ghost"
              onClick={() => setContacts((all) => [...all, emptyContact()])}
            >
              <Plus size={18} aria-hidden /> {t('companies.form.addContact')}
            </button>
          )}
        </fieldset>

        <div className="field">
          <label htmlFor="company-notes">{t('companies.form.notes')}</label>
          <textarea
            id="company-notes"
            className="textarea"
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <p role="alert" className="form-error">
          {error?.field === 'form' ? error.message : ''}
        </p>
      </form>
    </Modal>
  );
}
