import { ApiRequestError } from '@provecheck/shared';
import type { TFunction } from 'i18next';

export const errorText = (t: TFunction, err: unknown) =>
  err instanceof ApiRequestError ? t(`errors.${err.code}`) : t('errors.INTERNAL');

/** Idempotency key for the finalize call; it only has to be unique, not secret. */
export const newId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

/** Same calendar day in the organization's zone (America/Montevideo). */
export const sameDay = (a: string, b: Date) => {
  const day = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo' }).format(d);
  return day(new Date(a)) === day(b);
};
