import {
  ApiRequestError,
  USER_ROLES,
  emailSchema,
  usernameSchema,
  type UserDto,
  type UserRole,
} from '@provecheck/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AtSign, Mail, Phone, User } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { Field } from '../../components/Field';
import { SelectField } from '../../components/SelectField';
import { Modal } from '../../components/ui/Modal';
import { generateTemporaryPassword } from '../../lib/password';
import { errorMessage } from '../auth/errors';
import { PasswordBox } from './PasswordBox';

export type DrawerMode = { kind: 'create' } | { kind: 'edit'; user: UserDto };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Live uniqueness check (RN-25) once the value has a valid format and differs from the saved one. */
function useTaken(
  value: string,
  valid: boolean,
  original: string | undefined,
  exceptUserId: string | undefined,
) {
  const normalized = useDebounced(value.trim().toLowerCase(), 400);
  const enabled = valid && normalized === value.trim().toLowerCase() && normalized !== original;
  const q = useQuery({
    queryKey: ['availability', normalized, exceptUserId],
    queryFn: () => api.users.availability(normalized, exceptUserId),
    enabled,
  });
  return { taken: enabled && q.data?.available === false, checking: enabled && q.isFetching };
}

const NO_COMPANY = 'none';

export function UserDrawer(props: {
  mode: DrawerMode | null;
  onClose: () => void;
  onCreated: (user: UserDto, password: string) => void;
  onUpdated: (user: UserDto) => void;
}) {
  const { mode } = props;
  // Remount per target so the form never carries values over from the previous one.
  return mode ? (
    <DrawerForm key={mode.kind === 'edit' ? mode.user.id : 'create'} {...props} mode={mode} />
  ) : null;
}

function DrawerForm({
  mode,
  onClose,
  onCreated,
  onUpdated,
}: {
  mode: DrawerMode;
  onClose: () => void;
  onCreated: (u: UserDto, p: string) => void;
  onUpdated: (u: UserDto) => void;
}) {
  const { t } = useTranslation();
  const editing = mode.kind === 'edit' ? mode.user : null;
  const [name, setName] = useState(editing?.name ?? '');
  const [username, setUsername] = useState(editing?.username ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [role, setRole] = useState<UserRole>(editing?.role ?? 'collaborator');
  const [companyId, setCompanyId] = useState(editing?.clientCompanyId ?? NO_COMPANY);
  const [password, setPassword] = useState(() => generateTemporaryPassword());
  const [serverError, setServerError] = useState<{
    field: 'username' | 'email' | 'form';
    message: string;
  } | null>(null);

  const usernameValid = usernameSchema.safeParse(username).success;
  const emailValid = emailSchema.safeParse(email).success;
  const usernameCheck = useTaken(username, usernameValid, editing?.username, editing?.id);
  const emailCheck = useTaken(email, emailValid, editing?.email, editing?.id);

  const companies = useQuery({
    queryKey: ['companies'],
    queryFn: api.companyOptions,
    enabled: role === 'client_user',
  });

  const usernameError =
    username && !usernameValid
      ? t('users.form.usernameFormat')
      : usernameCheck.taken
        ? t('users.form.usernameTaken')
        : serverError?.field === 'username'
          ? serverError.message
          : undefined;
  const emailError =
    email && !emailValid
      ? t('users.form.emailFormat')
      : emailCheck.taken
        ? t('users.form.emailTaken')
        : serverError?.field === 'email'
          ? serverError.message
          : undefined;
  const complete = name.trim() && usernameValid && emailValid && phone.trim().length >= 3;

  const save = useMutation({
    mutationFn: async (): Promise<UserDto> => {
      const company = role === 'client_user' && companyId !== NO_COMPANY ? companyId : undefined;
      if (!editing) {
        return api.users.create({
          name,
          username,
          email,
          phone,
          role,
          temporaryPassword: password,
          ...(company ? { clientCompanyId: company } : {}),
        });
      }
      let user = await api.users.update(editing.id, { name, phone, username, email });
      if (role === 'client_user' && (company ?? null) !== editing.clientCompanyId) {
        user = await api.users.setClientCompany(editing.id, company ?? null);
      }
      return user;
    },
    onSuccess: (user) => (editing ? onUpdated(user) : onCreated(user, password)),
    onError: (err) => {
      const field =
        err instanceof ApiRequestError && err.code === 'IDENTIFIER_TAKEN'
          ? (err.details?.field as 'username' | 'email' | undefined)
          : undefined;
      setServerError(
        field === 'username'
          ? { field, message: t('users.form.usernameTaken') }
          : field === 'email'
            ? { field, message: t('users.form.emailTaken') }
            : { field: 'form', message: errorMessage(t, err) },
      );
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    save.mutate();
  }

  const blocked =
    !complete ||
    !!usernameError ||
    !!emailError ||
    usernameCheck.checking ||
    emailCheck.checking ||
    save.isPending;

  return (
    <Modal
      variant="drawer"
      open
      onClose={onClose}
      title={editing ? t('users.form.editTitle') : t('users.form.createTitle')}
      description={editing ? t('users.form.editSubtitle') : t('users.form.createSubtitle')}
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" form="user-form" className="primary inline" disabled={blocked}>
            {editing ? t('common.save') : t('users.form.create')}
          </button>
        </>
      }
    >
      <form id="user-form" className="form-stack" onSubmit={submit} noValidate>
        <Field
          label={t('users.form.name')}
          icon={User}
          value={name}
          onChange={setName}
          autoComplete="off"
          required
        />
        <Field
          label={t('users.form.username')}
          icon={AtSign}
          value={username}
          onChange={(v) => setUsername(v.toLowerCase())}
          error={usernameError}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
        <Field
          label={t('users.form.email')}
          icon={Mail}
          type="email"
          value={email}
          onChange={setEmail}
          error={emailError}
          autoComplete="off"
          required
        />
        <Field
          label={t('users.form.phone')}
          icon={Phone}
          type="tel"
          value={phone}
          onChange={setPhone}
          autoComplete="off"
          required
        />
        <SelectField
          label={t('users.form.role')}
          value={role}
          disabled={!!editing}
          options={USER_ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) }))}
          onChange={(v) => setRole(v as UserRole)}
        />
        {role === 'client_user' && (
          <SelectField
            label={t('users.form.company')}
            value={companyId}
            hint={t('users.form.companyHint')}
            options={[
              { value: NO_COMPANY, label: t('users.form.noCompany') },
              ...(companies.data?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
            ]}
            onChange={setCompanyId}
          />
        )}
        {!editing && (
          <div className="field">
            <span className="label">{t('users.form.tempPassword')}</span>
            <PasswordBox
              value={password}
              onGenerate={() => setPassword(generateTemporaryPassword())}
              startVisible
            />
            <p className="hint">{t('users.form.tempHint')}</p>
          </div>
        )}
        <p role="alert" className="form-error">
          {serverError?.field === 'form' ? serverError.message : ''}
        </p>
      </form>
    </Modal>
  );
}
