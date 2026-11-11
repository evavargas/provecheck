// Stable error codes shared by API and clients; clients map them to i18n keys `errors.<code>`.
export const ERROR_CODES = [
  'validation_failed',
  'unauthorized',
  'forbidden',
  'not_found',
  'internal',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  code: ErrorCode;
  requestId?: string;
}
