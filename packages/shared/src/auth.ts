import { z } from 'zod';
import { LOCALES, THEME_PREFERENCES, USER_ROLES } from './enums';

export const MIN_PASSWORD_LENGTH = 10;

/** Usernames and emails are case-insensitive and never contain spaces (RN-25). */
export const identifierSchema = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.string().min(3).max(254));

export const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(128);

export const loginInput = z
  .object({ identifier: identifierSchema, password: z.string().min(1).max(128) })
  .strict();
export type LoginInput = z.infer<typeof loginInput>;

export const firstLoginInput = z
  .object({ email: z.string().trim().toLowerCase().email().max(254), newPassword: passwordSchema })
  .strict();
export type FirstLoginInput = z.infer<typeof firstLoginInput>;

export const changePasswordInput = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema })
  .strict();

export const refreshInput = z.object({ refreshToken: z.string().min(1) }).strict();

export const preferencesInput = z
  .object({
    theme: z.enum(THEME_PREFERENCES).optional(),
    locale: z.enum(LOCALES).nullable().optional(),
  })
  .strict();
export type PreferencesInput = z.infer<typeof preferencesInput>;

export interface SessionDto {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface MeDto {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  role: (typeof USER_ROLES)[number];
  theme: (typeof THEME_PREFERENCES)[number];
  locale: (typeof LOCALES)[number] | null;
  mustChangePassword: boolean;
  organizationName: string;
}

export interface LoginResponse {
  session: SessionDto;
  user: MeDto;
  mustChangePassword: boolean;
}
