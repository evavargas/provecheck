import type { TaskDto } from '@provecheck/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Banknote, Clock, MapPin, User } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { CheckboxField } from '../../components/CheckboxField';
import { Field } from '../../components/Field';
import { SelectField } from '../../components/SelectField';
import { Modal } from '../../components/ui/Modal';
import { errorMessage } from '../auth/errors';

const NONE = 'none';

/** `datetime-local` works in the browser's zone; shortcut: the organization zone is not applied, upgrade when admins work from another country. */
const toInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function TaskDrawer(props: {
  task: TaskDto | 'new' | null;
  onClose: () => void;
  onSaved: (task: TaskDto, created: boolean) => void;
}) {
  const { task } = props;
  // Remount per target so the form never carries values over from the previous one.
  return task ? <Form key={task === 'new' ? 'new' : task.id} {...props} task={task} /> : null;
}

function Form({
  task,
  onClose,
  onSaved,
}: {
  task: TaskDto | 'new';
  onClose: () => void;
  onSaved: (t: TaskDto, created: boolean) => void;
}) {
  const { t } = useTranslation();
  const editing = task === 'new' ? null : task;
  const locked = editing?.status === 'on_site';
  const [companyId, setCompanyId] = useState(editing?.clientCompanyId ?? NONE);
  const [userId, setUserId] = useState(editing?.clientUserId ?? NONE);
  const [serviceId, setServiceId] = useState(editing?.serviceTypeId ?? NONE);
  const [address, setAddress] = useState(editing?.address ?? '');
  const [recipientName, setRecipientName] = useState(editing?.recipientName ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [instructions, setInstructions] = useState(editing?.instructions ?? '');
  const [start, setStart] = useState(editing ? toInput(editing.scheduledStartAt) : '');
  const [hours, setHours] = useState(editing?.assignedHours?.toString() ?? '');
  const [cost, setCost] = useState(editing?.costUyu?.toString() ?? '');
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const companies = useQuery({ queryKey: ['companies', 'options'], queryFn: api.companyOptions });
  const clients = useQuery({
    queryKey: ['users', 'clients'],
    queryFn: () => api.users.list({ role: 'client_user', limit: 100 }),
  });
  const services = useQuery({
    queryKey: ['service-types', 'active'],
    queryFn: () => api.serviceTypes.list(true),
  });
  const collaborators = useQuery({
    queryKey: ['users', 'collaborators'],
    queryFn: () => api.users.list({ role: 'collaborator', limit: 100 }),
    enabled: !editing,
  });

  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
  const hoursValue = num(hours);
  const costValue = num(cost);
  const bad = (n: number | null) => n !== null && (Number.isNaN(n) || n < 0);
  const hasRecipient = companyId !== NONE || userId !== NONE;
  const pickedIds = Object.keys(picked);
  const feeBad = pickedIds.some((id) => bad(num(picked[id]!)));
  const blocked =
    !description.trim() ||
    !start ||
    !hasRecipient ||
    (!editing && pickedIds.length === 0) ||
    (!address.trim() && companyId === NONE) ||
    bad(costValue) ||
    bad(hoursValue) ||
    feeBad;

  const save = useMutation({
    mutationFn: () => {
      const open = {
        serviceTypeId: serviceId === NONE ? null : serviceId,
        recipientName,
        description,
        instructions,
        assignedHours: hoursValue,
        costUyu: costValue,
      };
      const common = {
        ...open,
        clientCompanyId: companyId === NONE ? null : companyId,
        clientUserId: userId === NONE ? null : userId,
        scheduledStartAt: new Date(start).toISOString(),
      };
      // Locked fields must not be sent once the task is on site.
      if (editing) return api.tasks.update(editing.id, { address, ...(locked ? open : common) });
      return api.tasks.create({
        ...common,
        ...(address.trim() ? { address } : {}),
        assignments: pickedIds.map((id) => ({ collaboratorId: id, feeUyu: num(picked[id]!) })),
      });
    },
    onSuccess: (saved) => onSaved(saved, !editing),
    onError: (err) => setError(errorMessage(t, err)),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    save.mutate();
  }
  const toggle = (id: string, on: boolean) =>
    setPicked((p) =>
      on ? { ...p, [id]: '' } : Object.fromEntries(Object.entries(p).filter(([k]) => k !== id)),
    );

  const options = (items: { id: string; name: string }[]) => [
    { value: NONE, label: t('tasks.form.none') },
    ...items.map((i) => ({ value: i.id, label: i.name })),
  ];

  return (
    <Modal
      variant="drawer"
      open
      onClose={onClose}
      title={editing ? t('tasks.form.editTitle') : t('tasks.form.createTitle')}
      description={editing ? t('tasks.form.editSubtitle') : t('tasks.form.createSubtitle')}
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="task-form"
            className="primary inline"
            disabled={blocked || save.isPending}
          >
            {editing ? t('common.save') : t('tasks.form.create')}
          </button>
        </>
      }
    >
      <form id="task-form" className="form-stack" onSubmit={submit} noValidate>
        <SelectField
          label={t('tasks.form.company')}
          value={companyId}
          disabled={locked}
          options={options(companies.data?.items ?? [])}
          onChange={setCompanyId}
        />
        <SelectField
          label={t('tasks.form.clientUser')}
          value={userId}
          disabled={locked}
          hint={hasRecipient ? t('tasks.form.recipientHint') : t('tasks.form.recipientRequired')}
          options={options(clients.data?.items ?? [])}
          onChange={setUserId}
        />
        <SelectField
          label={t('tasks.form.serviceType')}
          value={serviceId}
          options={options(services.data?.items ?? [])}
          onChange={setServiceId}
        />
        <div>
          <Field
            label={t('tasks.form.address')}
            icon={MapPin}
            value={address}
            onChange={setAddress}
            autoComplete="off"
          />
          <p className="hint">{t('tasks.form.addressHint')}</p>
        </div>
        <Field
          label={t('tasks.form.recipientName')}
          icon={User}
          value={recipientName}
          onChange={setRecipientName}
          autoComplete="off"
        />
        <div className="field">
          <label htmlFor="task-description">{t('tasks.form.description')}</label>
          <textarea
            id="task-description"
            className="textarea"
            rows={3}
            maxLength={4000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="task-instructions">{t('tasks.form.instructions')}</label>
          <textarea
            id="task-instructions"
            className="textarea"
            rows={2}
            maxLength={4000}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="task-start">{t('tasks.form.start')}</label>
          <input
            id="task-start"
            type="datetime-local"
            className="plain-input"
            value={start}
            disabled={locked}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <Field
          label={t('tasks.form.hours')}
          icon={Clock}
          inputMode="decimal"
          value={hours}
          onChange={(v) => setHours(v.replace(/[^\d.,]/g, ''))}
          autoComplete="off"
        />
        <div>
          <Field
            label={t('tasks.form.costs')}
            icon={Banknote}
            inputMode="decimal"
            value={cost}
            onChange={(v) => setCost(v.replace(/[^\d.,]/g, ''))}
            autoComplete="off"
          />
          <p className="hint">{t('tasks.form.costsHint')}</p>
        </div>

        {!editing && (
          <fieldset className="contacts">
            <legend className="label">{t('tasks.form.assignment')}</legend>
            <p className="hint">
              {pickedIds.length === 0
                ? t('tasks.form.assignmentRequired')
                : t('tasks.form.assignmentHint')}
            </p>
            {collaborators.data?.items.length === 0 && (
              <p className="hint">{t('tasks.form.noCollaborators')}</p>
            )}
            {collaborators.data?.items
              .filter((c) => c.status !== 'inactive')
              .map((c) => (
                <div key={c.id} className="assign-row">
                  <CheckboxField
                    label={c.name}
                    checked={c.id in picked}
                    onChange={(on) => toggle(c.id, on)}
                  />
                  {c.id in picked && (
                    <input
                      className="plain-input"
                      inputMode="decimal"
                      aria-label={`${t('tasks.form.fee')}: ${c.name}`}
                      placeholder={t('tasks.form.fee')}
                      value={picked[c.id]}
                      onChange={(e) =>
                        setPicked((p) => ({ ...p, [c.id]: e.target.value.replace(/[^\d.,]/g, '') }))
                      }
                    />
                  )}
                </div>
              ))}
          </fieldset>
        )}
        <p role="alert" className="form-error">
          {error ?? ''}
        </p>
      </form>
    </Modal>
  );
}
