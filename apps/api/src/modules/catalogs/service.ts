import type {
  CompanyDto,
  CompanyList,
  CompanyWrite,
  ServiceTypeDto,
  CompanyPatch,
} from '@provecheck/shared';
import type { z } from 'zod';
import type { listCompaniesQuery } from '@provecheck/shared';
import type pg from 'pg';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Actor, Db } from '../../plugins/db.js';

const UNIQUE_VIOLATION = '23505';

interface CompanyRow {
  id: string;
  legal_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  contacts: CompanyDto['contacts'];
  notes: string | null;
  objection_window_hours: number | null;
  active: boolean;
  created_at: Date;
  cursor_ts: string;
}

const COMPANY_SELECT = `SELECT id, legal_name, address, phone, email, contacts, notes, objection_window_hours,
  active, created_at, created_at::text AS cursor_ts FROM client_companies`;

const toCompany = (r: CompanyRow): CompanyDto => ({
  id: r.id,
  legalName: r.legal_name,
  address: r.address,
  phone: r.phone,
  email: r.email,
  contacts: r.contacts,
  notes: r.notes,
  objectionWindowHours: r.objection_window_hours,
  active: r.active,
  createdAt: r.created_at.toISOString(),
});

// Same keyset scheme as users: the timestamp travels as text to keep microseconds.
const encodeCursor = (r: CompanyRow) =>
  Buffer.from(JSON.stringify([r.cursor_ts, r.id])).toString('base64url');
function decodeCursor(cursor: string): [string, string] {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (Array.isArray(parsed) && typeof parsed[0] === 'string' && typeof parsed[1] === 'string') {
      return [parsed[0], parsed[1]];
    }
  } catch {
    /* falls through */
  }
  throw new AppError('VALIDATION_ERROR', { field: 'cursor' });
}
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/** Turns the unique-name violation into the stable API error. */
async function unique<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if ((err as { code?: string }).code === UNIQUE_VIOLATION) throw new AppError('NAME_TAKEN');
    throw err;
  }
}

export function createCatalogsService(deps: { db: Db }) {
  const { db } = deps;

  async function companyRow(c: pg.PoolClient, id: string): Promise<CompanyRow> {
    const { rows } = await c.query<CompanyRow>(`${COMPANY_SELECT} WHERE id = $1`, [id]);
    if (!rows[0]) throw new AppError('NOT_FOUND');
    return rows[0];
  }

  async function setCompanyActive(actor: Actor, id: string, active: boolean) {
    return db.asActor(actor, async (c) => {
      const before = await companyRow(c, id);
      if (before.active === active) return toCompany(before);
      await c.query('UPDATE client_companies SET active = $2 WHERE id = $1', [id, active]);
      await audit(c, {
        orgId: actor.orgId,
        actorId: actor.id,
        entity: 'client_company',
        entityId: id,
        action: active ? 'reactivate' : 'deactivate',
      });
      return toCompany(await companyRow(c, id));
    });
  }

  return {
    async listCompanies(actor: Actor, q: z.infer<typeof listCompaniesQuery>): Promise<CompanyList> {
      const [cursorTs, cursorId] = q.cursor ? decodeCursor(q.cursor) : [null, null];
      const like = q.q ? `%${escapeLike(q.q)}%` : null;
      const { rows, defaults } = await db.asActor(actor, async (c) => {
        const res = await c.query<CompanyRow>(
          `${COMPANY_SELECT}
           WHERE ($1::text IS NULL OR legal_name ILIKE $1) AND ($2::boolean IS NULL OR active = $2)
             AND ($3::timestamptz IS NULL OR (created_at, id) < ($3::timestamptz, $4::uuid))
           ORDER BY created_at DESC, id DESC LIMIT $5`,
          [like, q.active ? q.active === 'true' : null, cursorTs, cursorId, q.limit + 1],
        );
        const org = await c.query<{ hours: number }>(
          'SELECT default_objection_window_hours AS hours FROM organizations',
        );
        return { rows: res.rows, defaults: org.rows[0]!.hours };
      });
      const page = rows.slice(0, q.limit);
      return {
        items: page.map(toCompany),
        nextCursor: rows.length > q.limit ? encodeCursor(page.at(-1)!) : null,
        defaultObjectionWindowHours: defaults,
      };
    },

    async companyOptions(actor: Actor) {
      const { rows } = await db.asActor(actor, (c) =>
        c.query<{ id: string; name: string }>(
          'SELECT id, legal_name AS name FROM client_companies WHERE active ORDER BY legal_name',
        ),
      );
      return { items: rows };
    },

    createCompany(actor: Actor, input: CompanyWrite): Promise<CompanyDto> {
      return unique(() =>
        db.asActor(actor, async (c) => {
          const { rows } = await c.query<{ id: string }>(
            `INSERT INTO client_companies (organization_id, legal_name, address, phone, email, contacts, notes, objection_window_hours)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
            [
              actor.orgId,
              input.legalName,
              input.address ?? null,
              input.phone ?? null,
              input.email ?? null,
              JSON.stringify(input.contacts ?? []),
              input.notes ?? null,
              input.objectionWindowHours ?? null,
            ],
          );
          const id = rows[0]!.id;
          const created = await companyRow(c, id);
          await audit(c, {
            orgId: actor.orgId,
            actorId: actor.id,
            entity: 'client_company',
            entityId: id,
            action: 'create',
            after: toCompany(created),
          });
          return toCompany(created);
        }),
      );
    },

    updateCompany(actor: Actor, id: string, input: CompanyPatch): Promise<CompanyDto> {
      const columns: Record<string, string> = {
        legalName: 'legal_name',
        address: 'address',
        phone: 'phone',
        email: 'email',
        contacts: 'contacts',
        notes: 'notes',
        objectionWindowHours: 'objection_window_hours',
      };
      const entries = Object.entries(input).filter(([k, v]) => k in columns && v !== undefined);
      return unique(() =>
        db.asActor(actor, async (c) => {
          const before = toCompany(await companyRow(c, id));
          if (entries.length) {
            // Column names come from the fixed map above, never from the request.
            const sets = entries.map(([k], i) => `${columns[k]} = $${i + 2}`).join(', ');
            await c.query(`UPDATE client_companies SET ${sets} WHERE id = $1`, [
              id,
              ...entries.map(([k, v]) => (k === 'contacts' ? JSON.stringify(v) : v)),
            ]);
          }
          const after = toCompany(await companyRow(c, id));
          await audit(c, {
            orgId: actor.orgId,
            actorId: actor.id,
            entity: 'client_company',
            entityId: id,
            action: 'update',
            before,
            after,
          });
          return after;
        }),
      );
    },

    deactivateCompany: (actor: Actor, id: string) => setCompanyActive(actor, id, false),
    reactivateCompany: (actor: Actor, id: string) => setCompanyActive(actor, id, true),

    async listServiceTypes(actor: Actor, active?: 'true' | 'false') {
      const { rows } = await db.asActor(actor, (c) =>
        c.query<ServiceTypeDto>(
          `SELECT id, name, active FROM service_types WHERE ($1::boolean IS NULL OR active = $1) ORDER BY name`,
          [active ? active === 'true' : null],
        ),
      );
      return { items: rows };
    },

    createServiceType(actor: Actor, name: string): Promise<ServiceTypeDto> {
      return unique(() =>
        db.asActor(actor, async (c) => {
          const { rows } = await c.query<ServiceTypeDto>(
            'INSERT INTO service_types (organization_id, name) VALUES ($1,$2) RETURNING id, name, active',
            [actor.orgId, name],
          );
          await audit(c, {
            orgId: actor.orgId,
            actorId: actor.id,
            entity: 'service_type',
            entityId: rows[0]!.id,
            action: 'create',
            after: rows[0],
          });
          return rows[0]!;
        }),
      );
    },

    updateServiceType(
      actor: Actor,
      id: string,
      input: { name?: string; active?: boolean },
    ): Promise<ServiceTypeDto> {
      return unique(() =>
        db.asActor(actor, async (c) => {
          const found = await c.query<ServiceTypeDto>(
            'SELECT id, name, active FROM service_types WHERE id = $1',
            [id],
          );
          const before = found.rows[0];
          if (!before) throw new AppError('NOT_FOUND');
          const { rows } = await c.query<ServiceTypeDto>(
            `UPDATE service_types SET name = COALESCE($2, name), active = COALESCE($3, active)
             WHERE id = $1 RETURNING id, name, active`,
            [id, input.name ?? null, input.active ?? null],
          );
          await audit(c, {
            orgId: actor.orgId,
            actorId: actor.id,
            entity: 'service_type',
            entityId: id,
            action: 'update',
            before,
            after: rows[0],
          });
          return rows[0]!;
        }),
      );
    },
  };
}

export type CatalogsService = ReturnType<typeof createCatalogsService>;
