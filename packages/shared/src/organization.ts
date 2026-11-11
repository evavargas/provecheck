import { z } from 'zod';
import { LOCALES } from './enums';

// A short list is enough for the MVP; the zone is applied to the PDF and its mail.
export const TIMEZONES = [
  'America/Montevideo',
  'America/Argentina/Buenos_Aires',
  'America/Sao_Paulo',
  'America/Santiago',
  'America/Bogota',
  'America/Mexico_City',
  'Europe/Madrid',
  'UTC',
] as const;

export const updateOrganizationInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    timezone: z.enum(TIMEZONES),
    defaultLocale: z.enum(LOCALES),
    defaultObjectionWindowHours: z.number().int().min(1).max(8760),
  })
  .partial()
  .strict();
export type UpdateOrganizationInput = z.input<typeof updateOrganizationInput>;

export const LOGO_TYPES = ['image/png', 'image/jpeg'] as const;
export const MAX_LOGO_BYTES = 1024 * 1024;
export const presignLogoInput = z
  .object({
    contentType: z.enum(LOGO_TYPES),
    bytes: z.number().int().positive().max(MAX_LOGO_BYTES),
  })
  .strict();
export type PresignLogoInput = z.input<typeof presignLogoInput>;

export interface OrganizationDto {
  id: string;
  name: string;
  timezone: string;
  defaultLocale: 'es-UY' | 'en';
  defaultObjectionWindowHours: number;
  /** Short-lived read URL; null when no logo was uploaded. */
  logoUrl: string | null;
  /** Informational (spec P-13): whether the API can send mail and from which address. */
  mail: { configured: boolean; from: string };
}

export const listAuditQuery = z.object({
  entity: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(64).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.coerce.number().int().positive().optional(),
});
export type ListAuditParams = {
  entity?: string;
  entityId?: string;
  from?: string;
  to?: string;
  cursor?: number;
};

export interface AuditEntryDto {
  id: number;
  createdAt: string;
  actorName: string | null;
  entity: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
}

export interface AuditList {
  items: AuditEntryDto[];
  nextCursor: number | null;
}
