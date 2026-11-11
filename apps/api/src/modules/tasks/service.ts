import {
  type AssignmentDto,
  type AssignmentInput,
  type TaskDto,
  type TaskList,
  type TaskPatch,
  type TaskStatus,
  type TaskWrite,
  type listTasksQuery,
} from '@provecheck/shared';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Actor, Db } from '../../plugins/db.js';

interface Row {
  id: string;
  status: TaskStatus;
  client_company_id: string | null;
  company_name: string | null;
  client_user_id: string | null;
  client_user_name: string | null;
  address: string;
  recipient_name: string | null;
  scheduled_start_at: Date;
  assigned_hours: string | null;
  description: string;
  instructions: string | null;
  service_type_id: string | null;
  service_type_name: string | null;
  cost_uyu: string | null;
  completed_at: Date | null;
  objection_deadline_at: Date | null;
  cancellation_reason: string | null;
  created_at: Date;
  cursor_ts: string;
  assignments: {
    id: string;
    collaboratorId: string;
    collaboratorName: string;
    feeUyu: string | null;
    arrivedAt: string | null;
    attendanceDelayed: boolean;
    active: boolean;
  }[];
}

// Replaced assignments stay in the list (inactive) so the history of who was assigned is visible.
const SELECT = `
  SELECT t.id, t.status, t.client_company_id, c.legal_name AS company_name, t.client_user_id, cu.name AS client_user_name,
         t.address, t.recipient_name, t.scheduled_start_at, t.assigned_hours, t.description, t.instructions,
         t.service_type_id, st.name AS service_type_name, t.cost_uyu, t.completed_at, t.objection_deadline_at,
         t.cancellation_reason, t.created_at, t.scheduled_start_at::text AS cursor_ts,
         COALESCE((
           SELECT json_agg(json_build_object('id', a.id, 'collaboratorId', a.collaborator_id, 'collaboratorName', u.name,
                  'feeUyu', a.collaborator_fee_uyu, 'arrivedAt', a.arrived_at, 'attendanceDelayed', a.attendance_delayed,
                  'active', a.active) ORDER BY a.created_at, u.name, a.id)
           FROM task_assignments a JOIN users u ON u.id = a.collaborator_id WHERE a.task_id = t.id), '[]') AS assignments
  FROM tasks t
  LEFT JOIN client_companies c ON c.id = t.client_company_id
  LEFT JOIN users cu ON cu.id = t.client_user_id
  LEFT JOIN service_types st ON st.id = t.service_type_id`;

const num = (v: string | null) => (v === null ? null : Number(v));

const toDto = (r: Row): TaskDto => ({
  id: r.id,
  status: r.status,
  clientCompanyId: r.client_company_id,
  clientCompanyName: r.company_name,
  clientUserId: r.client_user_id,
  clientUserName: r.client_user_name,
  address: r.address,
  recipientName: r.recipient_name,
  scheduledStartAt: r.scheduled_start_at.toISOString(),
  assignedHours: num(r.assigned_hours),
  description: r.description,
  instructions: r.instructions,
  serviceTypeId: r.service_type_id,
  serviceTypeName: r.service_type_name,
  costUyu: num(r.cost_uyu),
  completedAt: r.completed_at?.toISOString() ?? null,
  objectionDeadlineAt: r.objection_deadline_at?.toISOString() ?? null,
  cancellationReason: r.cancellation_reason,
  createdAt: r.created_at.toISOString(),
  assignments: r.assignments.map((a): AssignmentDto => ({ ...a, feeUyu: num(a.feeUyu) })),
});

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

const COLUMNS = {
  clientCompanyId: 'client_company_id',
  clientUserId: 'client_user_id',
  address: 'address',
  recipientName: 'recipient_name',
  scheduledStartAt: 'scheduled_start_at',
  assignedHours: 'assigned_hours',
  description: 'description',
  instructions: 'instructions',
  serviceTypeId: 'service_type_id',
  costUyu: 'cost_uyu',
} as const;
type Field = keyof typeof COLUMNS;

// What the admin may still change per state (P-03): cost until the end, everything operational while on site or scheduled.
const LOCKED_ON_SITE: Field[] = ['clientCompanyId', 'clientUserId', 'scheduledStartAt'];
const OPEN: TaskStatus[] = ['scheduled', 'on_site'];

export function createTasksService(deps: { db: Db }) {
  const { db } = deps;

  async function getRow(c: pg.PoolClient, id: string): Promise<Row> {
    const { rows } = await c.query<Row>(`${SELECT} WHERE t.id = $1`, [id]);
    if (!rows[0]) throw new AppError('NOT_FOUND');
    return rows[0];
  }

  const invalid = (field: string) => new AppError('VALIDATION_ERROR', { field });

  /** The task's recipient and catalog references must exist in the organization (RLS hides other organizations). */
  async function assertRefs(
    c: pg.PoolClient,
    refs: { companyId?: string | null; userId?: string | null; serviceTypeId?: string | null },
  ) {
    const exists = async (sql: string, id: string | null | undefined, field: string) => {
      if (id && !(await c.query(sql, [id])).rowCount) throw invalid(field);
    };
    await exists(
      'SELECT 1 FROM client_companies WHERE id = $1 AND active',
      refs.companyId,
      'clientCompanyId',
    );
    await exists(
      `SELECT 1 FROM users WHERE id = $1 AND role = 'client_user' AND status <> 'inactive'`,
      refs.userId,
      'clientUserId',
    );
    await exists(
      'SELECT 1 FROM service_types WHERE id = $1 AND active',
      refs.serviceTypeId,
      'serviceTypeId',
    );
  }

  async function assertCollaborator(c: pg.PoolClient, id: string) {
    const { rowCount } = await c.query(
      `SELECT 1 FROM users WHERE id = $1 AND role = 'collaborator' AND status <> 'inactive'`,
      [id],
    );
    if (!rowCount) throw invalid('collaboratorId');
  }

  async function insertAssignment(
    c: pg.PoolClient,
    actor: Actor,
    taskId: string,
    a: AssignmentInput,
  ) {
    await assertCollaborator(c, a.collaboratorId);
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO task_assignments (organization_id, task_id, collaborator_id, collaborator_fee_uyu)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [actor.orgId, taskId, a.collaboratorId, a.feeUyu ?? null],
    );
    return rows[0]!.id;
  }

  const log = (c: pg.PoolClient, actor: Actor, id: string, action: string, extra = {}) =>
    audit(c, {
      orgId: actor.orgId,
      actorId: actor.id,
      entity: 'task',
      entityId: id,
      action,
      ...extra,
    });

  /** Loads the task and checks it is still open for the change, inside the caller's transaction. */
  async function openTask(c: pg.PoolClient, id: string) {
    const task = await getRow(c, id);
    if (!OPEN.includes(task.status)) throw new AppError('INVALID_STATE_TRANSITION');
    return task;
  }

  return {
    async list(actor: Actor, q: z.infer<typeof listTasksQuery>): Promise<TaskList> {
      const [cursorTs, cursorId] = q.cursor ? decodeCursor(q.cursor) : [null, null];
      const like = q.q ? `%${escapeLike(q.q)}%` : null;
      const rows = await db.asActor(actor, async (c) => {
        const res = await c.query<Row>(
          `${SELECT}
           WHERE ($1::task_status[] IS NULL OR t.status = ANY($1))
             AND ($2::uuid IS NULL OR t.client_company_id = $2) AND ($3::uuid IS NULL OR t.client_user_id = $3)
             AND ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM task_assignments a WHERE a.task_id = t.id AND a.collaborator_id = $4))
             AND ($5::uuid IS NULL OR t.service_type_id = $5)
             AND ($6::timestamptz IS NULL OR t.scheduled_start_at >= $6) AND ($7::timestamptz IS NULL OR t.scheduled_start_at <= $7)
             AND (NOT $8::boolean OR EXISTS (SELECT 1 FROM objections o WHERE o.task_id = t.id))
             AND ($9::text IS NULL OR t.address ILIKE $9 OR t.description ILIKE $9)
             AND ($10::timestamptz IS NULL OR (t.scheduled_start_at, t.id) < ($10::timestamptz, $11::uuid))
           ORDER BY t.scheduled_start_at DESC, t.id DESC LIMIT $12`,
          [
            q.status ?? null,
            q.clientCompanyId ?? null,
            q.clientUserId ?? null,
            q.collaboratorId ?? null,
            q.serviceTypeId ?? null,
            q.from ?? null,
            q.to ?? null,
            q.hasObjection === 'true',
            like,
            cursorTs,
            cursorId,
            q.limit + 1,
          ],
        );
        return res.rows;
      });
      const page = rows.slice(0, q.limit);
      return {
        items: page.map(toDto),
        nextCursor: rows.length > q.limit ? encodeCursor(page.at(-1)!) : null,
      };
    },

    async get(actor: Actor, id: string): Promise<TaskDto> {
      return toDto(await db.asActor(actor, (c) => getRow(c, id)));
    },

    async create(actor: Actor, input: TaskWrite): Promise<TaskDto> {
      if (!input.clientCompanyId && !input.clientUserId) throw invalid('clientCompanyId'); // RN-2
      const ids = input.assignments.map((a) => a.collaboratorId);
      if (ids.length === 0) throw new AppError('EMPTY_ASSIGNMENT'); // RN-27
      if (new Set(ids).size !== ids.length) throw invalid('assignments');

      return db.asActor(actor, async (c) => {
        await assertRefs(c, {
          companyId: input.clientCompanyId,
          userId: input.clientUserId,
          serviceTypeId: input.serviceTypeId,
        });
        // The company's address pre-fills the task when the admin leaves it empty.
        let address = input.address;
        if (!address && input.clientCompanyId) {
          address =
            (
              await c.query<{ address: string | null }>(
                'SELECT address FROM client_companies WHERE id = $1',
                [input.clientCompanyId],
              )
            ).rows[0]?.address ?? undefined;
        }
        if (!address) throw invalid('address');

        const id = randomUUID();
        await c.query(
          `INSERT INTO tasks (id, organization_id, client_company_id, client_user_id, address, recipient_name,
             scheduled_start_at, assigned_hours, description, instructions, service_type_id, cost_uyu, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            id,
            actor.orgId,
            input.clientCompanyId ?? null,
            input.clientUserId ?? null,
            address,
            input.recipientName ?? null,
            input.scheduledStartAt,
            input.assignedHours ?? null,
            input.description,
            input.instructions ?? null,
            input.serviceTypeId ?? null,
            input.costUyu ?? null,
            actor.id,
          ],
        );
        for (const a of input.assignments) await insertAssignment(c, actor, id, a);
        const created = toDto(await getRow(c, id));
        await log(c, actor, id, 'create', { after: created });
        return created;
      });
    },

    async update(actor: Actor, id: string, patch: TaskPatch): Promise<TaskDto> {
      const entries = (Object.entries(patch) as [Field, unknown][]).filter(
        ([, v]) => v !== undefined,
      );
      return db.asActor(actor, async (c) => {
        const before = await getRow(c, id);
        // After the work started only the cost can change; a cancelled task is frozen.
        const allowed = (f: Field) =>
          before.status === 'scheduled' ||
          (before.status === 'on_site' && !LOCKED_ON_SITE.includes(f)) ||
          (before.status !== 'cancelled' && f === 'costUyu');
        if (entries.some(([f]) => !allowed(f))) throw new AppError('INVALID_STATE_TRANSITION');

        const next = {
          company: 'clientCompanyId' in patch ? patch.clientCompanyId : before.client_company_id,
          user: 'clientUserId' in patch ? patch.clientUserId : before.client_user_id,
        };
        if (!next.company && !next.user) throw invalid('clientCompanyId'); // RN-2
        await assertRefs(c, {
          companyId: patch.clientCompanyId,
          userId: patch.clientUserId,
          serviceTypeId: patch.serviceTypeId,
        });
        if (entries.length) {
          // Column names come from the fixed map above, never from the request.
          const sets = entries.map(([f], i) => `${COLUMNS[f]} = $${i + 2}`).join(', ');
          await c.query(`UPDATE tasks SET ${sets}, updated_at = now() WHERE id = $1`, [
            id,
            ...entries.map(([, v]) => v),
          ]);
        }
        const after = toDto(await getRow(c, id));
        await log(c, actor, id, 'update', { before: toDto(before), after });
        return after;
      });
    },

    async cancel(actor: Actor, id: string, reason: string): Promise<TaskDto> {
      return db.asActor(actor, async (c) => {
        const before = await getRow(c, id);
        if (before.status !== 'scheduled') throw new AppError('INVALID_STATE_TRANSITION'); // RN-20
        await c.query(
          `UPDATE tasks SET status = 'cancelled', cancellation_reason = $2, updated_at = now() WHERE id = $1`,
          [id, reason],
        );
        await log(c, actor, id, 'cancel', { before: { status: before.status }, after: { reason } });
        return toDto(await getRow(c, id));
      });
    },

    async addAssignment(actor: Actor, id: string, input: AssignmentInput): Promise<TaskDto> {
      return db.asActor(actor, async (c) => {
        await openTask(c, id);
        await uniqueActive(() => insertAssignment(c, actor, id, input));
        await log(c, actor, id, 'assignment_add', { after: input });
        return toDto(await getRow(c, id));
      });
    },

    /** RN-14 and RN-27: the old assignment stops being active and its replacement takes over in the same transaction. */
    async replaceAssignment(
      actor: Actor,
      id: string,
      assignmentId: string,
      input: AssignmentInput,
    ): Promise<TaskDto> {
      return db.asActor(actor, async (c) => {
        await openTask(c, id);
        const old = await c.query<{ collaborator_id: string }>(
          'SELECT collaborator_id FROM task_assignments WHERE id = $1 AND task_id = $2 AND active FOR UPDATE',
          [assignmentId, id],
        );
        if (!old.rows[0]) throw new AppError('NOT_FOUND');
        // Deactivate first: the unique index allows the same person to take over only after their own row is released.
        await c.query('UPDATE task_assignments SET active = false WHERE id = $1', [assignmentId]);
        const newId = await uniqueActive(() => insertAssignment(c, actor, id, input));
        await c.query('UPDATE task_assignments SET replaced_by = $2 WHERE id = $1', [
          assignmentId,
          newId,
        ]);
        await log(c, actor, id, 'assignment_replace', {
          before: { collaboratorId: old.rows[0].collaborator_id },
          after: { collaboratorId: input.collaboratorId },
        });
        return toDto(await getRow(c, id));
      });
    },
  };
}

/** The partial unique index rejects a collaborator who is already active on the task. */
async function uniqueActive<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if ((err as { code?: string }).code === '23505')
      throw new AppError('VALIDATION_ERROR', { field: 'collaboratorId' });
    throw err;
  }
}

export type TasksService = ReturnType<typeof createTasksService>;
