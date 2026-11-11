// Stable error codes shared by API and clients (spec 8.3). Clients translate via i18n key `errors.<code>`.
export const ERROR_CODES = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'INVALID_STATE_TRANSITION',
  'IDENTIFIER_TAKEN',
  'NAME_TAKEN',
  'INVALID_CREDENTIALS',
  'ACCOUNT_INACTIVE',
  'PASSWORD_CHANGE_REQUIRED',
  'HAS_PENDING_TASKS',
  'RATE_LIMITED',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  code: ErrorCode;
  message?: string;
  details?: Record<string, unknown>;
  requestId?: string;
}
