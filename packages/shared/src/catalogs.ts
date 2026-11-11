import { z } from 'zod';
import { emailSchema } from './users';

const text = (max: number) => z.string().trim().max(max);
/** Empty strings from forms become "not set". */
const optionalText = (max: number) => text(max).transform((v) => v || null);

export const contactSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    role: optionalText(80).optional(),
    phone: optionalText(30).optional(),
    email: emailSchema.optional().or(z.literal('').transform(() => undefined)),
  })
  .strict();
export type ContactInput = z.input<typeof contactSchema>;

const companyFields = {
  legalName: z.string().trim().min(1).max(160),
  address: optionalText(240),
  phone: optionalText(30),
  email: emailSchema.or(z.literal('').transform(() => null)).nullable(),
  contacts: z.array(contactSchema).max(20),
  notes: optionalText(2000),
  /** Null means "use the organization default" (RN-6). */
  objectionWindowHours: z.number().int().min(1).max(8760).nullable(),
};

export const createCompanyInput = z
  .object(companyFields)
  .partial({ address: true, phone: true, email: true, contacts: true, notes: true })
  .extend({ objectionWindowHours: companyFields.objectionWindowHours.default(null) })
  .strict();
export const updateCompanyInput = z.object(companyFields).partial().strict();
export type CreateCompanyInput = z.input<typeof createCompanyInput>;
export type UpdateCompanyInput = z.input<typeof updateCompanyInput>;

export const listCompaniesQuery = z.object({
  q: z.string().trim().max(100).optional(),
  active: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(300).optional(),
});
export type ListCompaniesParams = { q?: string; active?: boolean; cursor?: string };

export interface CompanyDto {
  id: string;
  legalName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  contacts: { name: string; role?: string | null; phone?: string | null; email?: string }[];
  notes: string | null;
  objectionWindowHours: number | null;
  active: boolean;
  createdAt: string;
}

export interface CompanyList {
  items: CompanyDto[];
  nextCursor: string | null;
  /** Organization default shown as help text when a company has no window of its own. */
  defaultObjectionWindowHours: number;
}

export const serviceTypeInput = z.object({ name: z.string().trim().min(1).max(80) }).strict();
export const updateServiceTypeInput = z
  .object({ name: z.string().trim().min(1).max(80), active: z.boolean() })
  .partial()
  .strict();
export const listServiceTypesQuery = z.object({ active: z.enum(['true', 'false']).optional() });

export interface ServiceTypeDto {
  id: string;
  name: string;
  active: boolean;
}

/** Parsed shapes (after trimming and empty-to-null), as the API receives them. */
export type CompanyWrite = z.output<typeof createCompanyInput>;
export type CompanyPatch = z.output<typeof updateCompanyInput>;
