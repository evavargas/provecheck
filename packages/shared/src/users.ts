import { z } from 'zod';
import { identifierSchema, passwordSchema } from './auth';
import { USER_ROLES } from './enums';

export const USER_STATUSES = ['active', 'inactive', 'pending_first_login'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

// RN-25: lowercase letters, digits, dot, dash and underscore; 3 to 30 characters, no "@".
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/);
export const emailSchema = z.string().trim().toLowerCase().email().max(254);

const nameSchema = z.string().trim().min(1).max(120);
const phoneSchema = z.string().trim().min(3).max(30);

export const createUserInput = z
  .object({
    name: nameSchema,
    username: usernameSchema,
    email: emailSchema,
    phone: phoneSchema,
    role: z.enum(USER_ROLES),
    temporaryPassword: passwordSchema,
    clientCompanyId: z.string().uuid().optional(),
  })
  .strict()
  .refine((v) => v.role === 'client_user' || v.clientCompanyId === undefined, {
    path: ['clientCompanyId'],
    message: 'only client users belong to a company',
  });
export type CreateUserInput = z.infer<typeof createUserInput>;

/** The role cannot change after creation: it decides which app the person uses and what they can see. */
export const updateUserInput = z
  .object({ name: nameSchema, phone: phoneSchema, username: usernameSchema, email: emailSchema })
  .partial()
  .strict();
export type UpdateUserInput = z.infer<typeof updateUserInput>;

export const listUsersQuery = z.object({
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(300).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuery>;
export type ListUsersParams = Partial<Omit<ListUsersQuery, 'limit'>> & { limit?: number };

export const availabilityQuery = z.object({
  identifier: identifierSchema,
  exceptUserId: z.string().uuid().optional(),
});
export const resetPasswordInput = z.object({ temporaryPassword: passwordSchema }).strict();
/** P-09: one replacement per pending task, applied in the same transaction as the deactivation (RN-14, RN-27). */
export const deactivateUserInput = z
  .object({
    replacements: z
      .array(z.object({ taskId: z.string().uuid(), collaboratorId: z.string().uuid() }).strict())
      .max(500)
      .default([]),
  })
  .strict();
export type Replacement = z.input<typeof deactivateUserInput>['replacements'] extends
  (infer R)[] | undefined
  ? R
  : never;
export const clientCompanyInput = z
  .object({ clientCompanyId: z.string().uuid().nullable() })
  .strict();

export interface UserDto {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  role: (typeof USER_ROLES)[number];
  status: UserStatus;
  clientCompanyId: string | null;
  clientCompanyName: string | null;
  createdAt: string;
}

export interface UserList {
  items: UserDto[];
  nextCursor: string | null;
}

export interface Availability {
  available: boolean;
  /** Which identifier is taken (username or email) when `available` is false. */
  kind: 'username' | 'email' | null;
}

export interface PendingTaskDto {
  id: string;
  address: string;
  scheduledStartAt: string;
  status: string;
}

export interface CompanyOptionDto {
  id: string;
  name: string;
}
