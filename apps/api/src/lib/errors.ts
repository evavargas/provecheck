import type { ErrorCode } from '@provecheck/shared';

const STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  INVALID_STATE_TRANSITION: 409,
  IDENTIFIER_TAKEN: 409,
  NAME_TAKEN: 409,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_INACTIVE: 403,
  PASSWORD_CHANGE_REQUIRED: 403,
  HAS_PENDING_TASKS: 409,
  EMPTY_ASSIGNMENT: 422,
  ALREADY_FINALIZED: 409,
  PHOTO_LIMIT_EXCEEDED: 422,
  PHOTOS_NOT_CONFIRMED: 422,
  PDF_PENDING: 404,
  RECIPIENT_REQUIRED: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.status = STATUS[code];
  }
}
