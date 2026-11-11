import type {
  Availability,
  CreateUserInput,
  ListUsersQuery,
  PendingTaskDto,
  UpdateUserInput,
  UserDto,
  UserList,
} from '@provecheck/shared';
import type pg from 'pg';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Actor, Db } from '../../plugins/db.js';
import type { Supabase } from '../../plugins/supabase.js';
import { createUser } from './create-user.js';

const UNIQUE_VIOLATION = '23505';

interface Row {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  role: UserDto['role'];
  status: UserDto['status'];
  client_company_id: string | null;
  company_name: string | null;
  created_at: Date;
  cursor_ts: string;
}

const SELECT = `
  SELECT u.id, u.name, u.username::text, u.email::text, u.phone, u.role, u.status, u.client_company_id,
         c.legal_name AS company_name, u.created_at, u.created_at::text AS cursor_ts
  FROM users u LEFT JOIN client_companies c ON c.id = u.client_company_id`;

const toDto = (r: Row): UserDto => ({
  id: r.id,
  name: r.name,
  username: r.username,
  email: r.email,
  phone: r.phone,
  role: r.role,
  status: r.status,
  clientCompanyId: r.client_company_id,
  clientCompanyName: r.company_name,
  createdAt: r.created_at.toISOString(),
});

// Keyset pagination on (created_at, id). The timestamp travels as text: JS dates would cut Postgres' microseconds.
const encodeCursor = (r: Row) =>
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

export function createUsersService(deps: { db: Db; supabase: Supabase }) {
  const { db, supabase } = deps;

  async function getRow(c: pg.PoolClient, id: string): Promise<Row> {
    const { rows } = await c.query<Row>(`${SELECT} WHERE u.id = $1`, [id]);
    if (!rows[0]) throw new AppError('NOT_FOUND');
    return rows[0];
  }

  /** Signs the person out everywhere. Runs as the table owner: the API role cannot touch the auth schema. */
  const revokeSessions = (userId: string) =>
    db.pool.query('DELETE FROM auth.sessions WHERE user_id = $1', [userId]);

  async function assertCompany(c: pg.PoolClient, companyId: string) {
    const { rowCount } = await c.query('SELECT 1 FROM client_companies WHERE id = $1 AND active', [
      companyId,
    ]);
    if (!rowCount) throw new AppError('VALIDATION_ERROR', { field: 'clientCompanyId' });
  }

  return {
    async list(actor: Actor, q: ListUsersQuery): Promise<UserList> {
      const [cursorTs, cursorId] = q.cursor ? decodeCursor(q.cursor) : [null, null];
      const like = q.q ? `%${escapeLike(q.q)}%` : null;
      const rows = await db.asActor(actor, async (c) => {
        const res = await c.query<Row>(
          `${SELECT}
           WHERE ($1::user_role IS NULL OR u.role = $1) AND ($2::user_status IS NULL OR u.status = $2)
             AND ($3::text IS NULL OR u.name ILIKE $3 OR u.username::text ILIKE $3 OR u.email::text ILIKE $3)
             AND ($4::timestamptz IS NULL OR (u.created_at, u.id) < ($4::timestamptz, $5::uuid))
           ORDER BY u.created_at DESC, u.id DESC LIMIT $6`,
          [q.role ?? null, q.status ?? null, like, cursorTs, cursorId, q.limit + 1],
        );
        return res.rows;
      });
      const page = rows.slice(0, q.limit);
      return {
        items: page.map(toDto),
        nextCursor: rows.length > q.limit ? encodeCursor(page.at(-1)!) : null,
      };
    },

    async get(actor: Actor, id: string): Promise<UserDto> {
      return toDto(await db.asActor(actor, (c) => getRow(c, id)));
    },

    /** Live check for the form (RN-25). Usernames and emails share one namespace. */
    async availability(identifier: string, exceptUserId?: string): Promise<Availability> {
      const { rows } = await db.pool.query<{ kind: 'username' | 'email' }>(
        'SELECT kind FROM user_identifiers WHERE identifier = $1 AND ($2::uuid IS NULL OR user_id <> $2)',
        [identifier, exceptUserId ?? null],
      );
      return { available: rows.length === 0, kind: rows[0]?.kind ?? null };
    },

    async create(actor: Actor, input: CreateUserInput): Promise<UserDto> {
      if (input.clientCompanyId) {
        await db.asActor(actor, (c) => assertCompany(c, input.clientCompanyId!));
      }
      const id = await createUser(
        { db, supabase },
        {
          organizationId: actor.orgId,
          role: input.role,
          name: input.name,
          username: input.username,
          email: input.email,
          phone: input.phone,
          temporaryPassword: input.temporaryPassword,
          ...(input.clientCompanyId ? { clientCompanyId: input.clientCompanyId } : {}),
        },
      );
      return db.asActor(actor, async (c) => {
        const row = await getRow(c, id);
        await audit(c, {
          orgId: actor.orgId,
          actorId: actor.id,
          entity: 'user',
          entityId: id,
          action: 'create',
          after: toDto(row),
        });
        return toDto(row);
      });
    },

    async update(actor: Actor, id: string, input: UpdateUserInput): Promise<UserDto> {
      return db.asActor(actor, async (c) => {
        const before = await getRow(c, id);
        try {
          if (input.username && input.username !== before.username) {
            await c.query(
              `UPDATE user_identifiers SET identifier = $1 WHERE user_id = $2 AND kind = 'username'`,
              [input.username, id],
            );
          }
          if (input.email && input.email !== before.email) {
            await c.query(
              `UPDATE user_identifiers SET identifier = $1 WHERE user_id = $2 AND kind = 'email'`,
              [input.email, id],
            );
          }
          await c.query(
            `UPDATE users SET name = COALESCE($2, name), phone = COALESCE($3, phone),
               username = COALESCE($4, username), email = COALESCE($5, email) WHERE id = $1`,
            [
              id,
              input.name ?? null,
              input.phone ?? null,
              input.username ?? null,
              input.email ?? null,
            ],
          );
        } catch (err) {
          if ((err as { code?: string }).code === UNIQUE_VIOLATION)
            throw new AppError('IDENTIFIER_TAKEN');
          throw err;
        }
        if (input.email && input.email !== before.email) {
          // Last step before COMMIT, so a Supabase failure rolls the database back.
          const { error } = await supabase.admin.auth.admin.updateUserById(id, {
            email: input.email,
            email_confirm: true,
          });
          if (error) throw error;
        }
        const after = await getRow(c, id);
        await audit(c, {
          orgId: actor.orgId,
          actorId: actor.id,
          entity: 'user',
          entityId: id,
          action: 'update',
          before: toDto(before),
          after: toDto(after),
        });
        return toDto(after);
      });
    },

    async setClientCompany(actor: Actor, id: string, companyId: string | null): Promise<UserDto> {
      return db.asActor(actor, async (c) => {
        const before = await getRow(c, id);
        if (before.role !== 'client_user')
          throw new AppError('VALIDATION_ERROR', { field: 'role' });
        if (companyId) await assertCompany(c, companyId);
        await c.query('UPDATE users SET client_company_id = $2 WHERE id = $1', [id, companyId]);
        const after = await getRow(c, id);
        await audit(c, {
          orgId: actor.orgId,
          actorId: actor.id,
          entity: 'user',
          entityId: id,
          action: 'set_client_company',
          before: toDto(before),
          after: toDto(after),
        });
        return toDto(after);
      });
    },

    /** Pending work blocks the deactivation: the reassignment wizard (P-09) comes with the task module. */
    async deactivate(actor: Actor, id: string): Promise<UserDto> {
      if (id === actor.id) throw new AppError('FORBIDDEN');
      const dto = await db.asActor(actor, async (c) => {
        const before = await getRow(c, id);
        if (before.status === 'inactive') throw new AppError('INVALID_STATE_TRANSITION');
        if (before.role === 'collaborator') {
          const { rows } = await c.query<{
            id: string;
            address: string;
            scheduled_start_at: Date;
            status: string;
          }>(
            `SELECT t.id, t.address, t.scheduled_start_at, t.status FROM task_assignments a JOIN tasks t ON t.id = a.task_id
             WHERE a.collaborator_id = $1 AND a.active AND t.status IN ('scheduled','on_site') ORDER BY t.scheduled_start_at`,
            [id],
          );
          if (rows.length) {
            const tasks: PendingTaskDto[] = rows.map((r) => ({
              id: r.id,
              address: r.address,
              scheduledStartAt: r.scheduled_start_at.toISOString(),
              status: r.status,
            }));
            throw new AppError('HAS_PENDING_TASKS', { tasks });
          }
        }
        await c.query(`UPDATE users SET status = 'inactive' WHERE id = $1`, [id]);
        const after = await getRow(c, id);
        await audit(c, {
          orgId: actor.orgId,
          actorId: actor.id,
          entity: 'user',
          entityId: id,
          action: 'deactivate',
          before: toDto(before),
          after: toDto(after),
        });
        return toDto(after);
      });
      await revokeSessions(id);
      return dto;
    },

    async reactivate(actor: Actor, id: string): Promise<UserDto> {
      return db.asActor(actor, async (c) => {
        const before = await getRow(c, id);
        if (before.status !== 'inactive') throw new AppError('INVALID_STATE_TRANSITION');
        // Someone who never finished the first login must still do it.
        await c.query(
          `UPDATE users SET status = CASE WHEN password_changed_at IS NULL THEN 'pending_first_login'::user_status ELSE 'active'::user_status END WHERE id = $1`,
          [id],
        );
        const after = await getRow(c, id);
        await audit(c, {
          orgId: actor.orgId,
          actorId: actor.id,
          entity: 'user',
          entityId: id,
          action: 'reactivate',
          before: toDto(before),
          after: toDto(after),
        });
        return toDto(after);
      });
    },

    /** The admin picks a temporary password; sessions end and the person repeats the first login (F2). */
    async resetPassword(actor: Actor, id: string, temporaryPassword: string): Promise<void> {
      await db.asActor(actor, async (c) => {
        const before = await getRow(c, id);
        if (before.status === 'inactive') throw new AppError('INVALID_STATE_TRANSITION');
        await c.query(
          `UPDATE users SET must_change_password = true, status = 'pending_first_login', email_confirmed_at = NULL WHERE id = $1`,
          [id],
        );
        await audit(c, {
          orgId: actor.orgId,
          actorId: actor.id,
          entity: 'user',
          entityId: id,
          action: 'reset_password',
        });
        const { error } = await supabase.admin.auth.admin.updateUserById(id, {
          password: temporaryPassword,
        });
        if (error) throw error;
      });
      await revokeSessions(id);
    },
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
