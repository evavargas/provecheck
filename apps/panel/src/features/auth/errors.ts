import { ApiRequestError } from '@provecheck/shared';
import type { TFunction } from 'i18next';

export const errorMessage = (t: TFunction, err: unknown) =>
  err instanceof ApiRequestError ? t(`errors.${err.code}`) : t('errors.INTERNAL');
