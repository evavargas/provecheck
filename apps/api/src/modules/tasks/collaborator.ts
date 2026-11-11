import {
  renderReportHtml,
  type ArrivalInput,
  type CollaboratorTaskDto,
  type CollaboratorTaskList,
  type FinalizeInput,
  type ReportDto,
  type TaskStatus,
  type listTasksQuery,
} from '@provecheck/shared';
import type pg from 'pg';
import type { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import { enqueue } from '../../lib/jobs.js';
import type { Actor, Db } from '../../plugins/db.js';

interface Row {
  id: string;
  status: TaskStatus;
  address: string;
  recipient_name: string | null;
  scheduled_start_at: Date;
  assigned_hours: string | null;
  description: string;
  instructions: string | null;
  service_type_name: string | null;
  company_name: string | null;
  company_phone: string | null;
  completed_at: Date | null;
  team: {
    assignment_id: string;
    collaborator_id: string;
    name: string;
    arrived_at: string | null;
    attendance_delayed: boolean;
    active: boolean;
  }[];
}

// Reads tasks_public (no cost column) and the team through a function that never returns fees (RN-13).
const SELECT = `
  SELECT t.id, t.status, t.address, t.recipient_name, t.scheduled_start_at, t.assigned_hours, t.description,
         t.instructions, st.name AS service_type_name, c.legal_name AS company_name, c.phone AS company_phone, t.completed_at,
         COALESCE((SELECT json_agg(row_to_json(m)) FROM app.task_team(t.id) m), '[]') AS team
  FROM tasks_public t
  LEFT JOIN service_types st ON st.id = t.service_type_id
  LEFT JOIN client_companies c ON c.id = t.client_company_id`;

const toDto = (r: Row, me: string): CollaboratorTaskDto => {
  const mine =
    r.team.find((m) => m.collaborator_id === me && m.active) ??
    r.team.find((m) => m.collaborator_id === me);
  return {
    id: r.id,
    status: r.status,
    address: r.address,
    recipientName: r.recipient_name,
    scheduledStartAt: r.scheduled_start_at.toISOString(),
    assignedHours: r.assigned_hours === null ? null : Number(r.assigned_hours),
    description: r.description,
    instructions: r.instructions,
    serviceTypeName: r.service_type_name,
    clientCompanyName: r.company_name,
    clientCompanyPhone: r.company_phone,
    completedAt: r.completed_at?.toISOString() ?? null,
    team: r.team.map((m) => ({
      collaboratorId: m.collaborator_id,
      name: m.name,
      active: m.active,
      arrivedAt: m.arrived_at,
    })),
    myArrivedAt: mine?.arrived_at ?? null,
    myAttendanceDelayed: mine?.attendance_delayed ?? false,
  };
};

const OPEN: TaskStatus[] = ['scheduled', 'on_site'];

export function createCollaboratorTasks(deps: { db: Db }) {
  const { db } = deps;

  async function getRow(c: pg.PoolClient, id: string, me: string) {
    const { rows } = await c.query<Row>(`${SELECT} WHERE t.id = $1`, [id]);
    if (!rows[0]) throw new AppError('NOT_FOUND');
    return toDto(rows[0], me);
  }

  const reportOf = async (c: pg.PoolClient, taskId: string): Promise<ReportDto | null> => {
    const { rows } = await c.query<{
      id: string;
      content_html: string;
      completed_by: string;
      received_at: Date;
    }>('SELECT id, content_html, completed_by, received_at FROM task_reports WHERE task_id = $1', [
      taskId,
    ]);
    const r = rows[0];
    return r
      ? {
          id: r.id,
          html: r.content_html,
          completedBy: r.completed_by,
          completedAt: r.received_at.toISOString(),
        }
      : null;
  };

  return {
    async list(actor: Actor, q: z.infer<typeof listTasksQuery>): Promise<CollaboratorTaskList> {
      const statuses = q.status ?? OPEN;
      const { rows } = await db.asActor(actor, (c) =>
        c.query<Row>(
          `${SELECT}
           WHERE t.status = ANY($1::task_status[]) AND ($2::timestamptz IS NULL OR t.scheduled_start_at >= $2)
             AND ($3::timestamptz IS NULL OR t.scheduled_start_at <= $3)
           ORDER BY t.scheduled_start_at ASC, t.id LIMIT $4`,
          [statuses, q.from ?? null, q.to ?? null, q.limit],
        ),
      );
      return { items: rows.map((r) => toDto(r, actor.id)) };
    },

    get: (actor: Actor, id: string) => db.asActor(actor, (c) => getRow(c, id, actor.id)),

    /** F6: the first arrival moves the task to on_site; each collaborator records their own. Repeats change nothing. */
    async arrival(actor: Actor, id: string, input: ArrivalInput): Promise<CollaboratorTaskDto> {
      return db.asActor(actor, async (c) => {
        await getRow(c, id, actor.id); // NOT_FOUND when it is not theirs
        const ok = await c.query<{ ok: boolean }>('SELECT app.register_arrival($1,$2,$3) AS ok', [
          id,
          input.deviceArrivedAt,
          input.attendanceDelayed,
        ]);
        // Cancelled, finished or reassigned meanwhile (F6.4).
        if (!ok.rows[0]!.ok) throw new AppError('INVALID_STATE_TRANSITION');
        const moved = await c.query(
          `UPDATE tasks SET status = 'on_site', updated_at = now() WHERE id = $1 AND status = 'scheduled'`,
          [id],
        );
        if (moved.rowCount) {
          await audit(c, {
            orgId: actor.orgId,
            actorId: actor.id,
            entity: 'task',
            entityId: id,
            action: 'arrival',
            before: { status: 'scheduled' },
            after: { status: 'on_site' },
          });
        }
        return getRow(c, id, actor.id);
      });
    },

    /** F8: one record per task (RN-9). The first finalize wins; the same reportId again is an idempotent retry. */
    async finalize(
      actor: Actor,
      id: string,
      input: FinalizeInput & { contentJson: unknown; photoIds: string[] },
    ) {
      const content = input.contentJson as Parameters<typeof renderReportHtml>[0];
      return db.asActor(actor, async (c) => {
        await getRow(c, id, actor.id);
        const { rows } = await c.query<{
          status: TaskStatus;
          client_company_id: string | null;
          window_hours: number | null;
          default_hours: number;
        }>(
          `SELECT t.status, t.client_company_id, c.objection_window_hours AS window_hours, o.default_objection_window_hours AS default_hours
           FROM tasks t JOIN organizations o ON o.id = t.organization_id LEFT JOIN client_companies c ON c.id = t.client_company_id
           WHERE t.id = $1 FOR UPDATE OF t`,
          [id],
        );
        const task = rows[0];
        if (!task) throw new AppError('NOT_FOUND');
        const existing = await reportOf(c, id);
        if (existing) {
          if (existing.id === input.reportId) return { report: existing };
          throw new AppError('ALREADY_FINALIZED', { report: existing });
        }
        // The task must be on site, and the caller must have arrived themselves.
        if (task.status !== 'on_site') throw new AppError('INVALID_STATE_TRANSITION');
        const mine = await c.query<{ arrived: boolean }>(
          'SELECT bool_or(arrived_at IS NOT NULL AND active AND collaborator_id = $2) AS arrived FROM app.task_team($1) GROUP BY ()',
          [id, actor.id],
        );
        if (!mine.rows[0]?.arrived) throw new AppError('INVALID_STATE_TRANSITION');

        // RN-6: correct the device clock drift using the server's reception time.
        const completed = new Date(input.deviceCompletedAt).getTime();
        const sent = new Date(input.deviceSentAt).getTime();
        const received = Date.now();
        const drift = sent >= completed ? sent - completed : 0;
        const correctedMs = received - drift;
        const hours = task.window_hours ?? task.default_hours;
        const deadline = new Date(correctedMs + hours * 3_600_000);

        await c.query(
          `INSERT INTO task_reports (id, organization_id, task_id, content_json, content_html, completed_by, device_completed_at, device_sent_at, received_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            input.reportId,
            actor.orgId,
            id,
            JSON.stringify(content),
            renderReportHtml(content),
            actor.id,
            input.deviceCompletedAt,
            input.deviceSentAt,
            new Date(received),
          ],
        );
        await c.query(
          `UPDATE tasks SET status = 'completed', completed_at = $2, received_at = $3, objection_deadline_at = $4, updated_at = now() WHERE id = $1`,
          [id, new Date(correctedMs), new Date(received), deadline],
        );
        // Only the caller's own, fully uploaded photos can join the record, in the order they sent (RN-17).
        if (input.photoIds.length) {
          const photos = await c.query(
            `SELECT id FROM task_photos WHERE task_id = $1 AND uploaded_by = $2 AND status = 'uploaded' AND id = ANY($3)`,
            [id, actor.id, input.photoIds],
          );
          if (photos.rowCount !== input.photoIds.length) throw new AppError('PHOTOS_NOT_CONFIRMED');
          await c.query(
            `UPDATE task_photos p SET position = o.pos - 1 FROM unnest($2::uuid[]) WITH ORDINALITY AS o(pid, pos)
             WHERE p.id = o.pid AND p.task_id = $1`,
            [id, input.photoIds],
          );
        }
        await c.query('DELETE FROM task_report_drafts WHERE task_id = $1', [id]);
        // RN-5: the PDF and the mail are queued in the same transaction, so the record never exists without them.
        await enqueue(c, actor.orgId, 'generate-pdf', { taskId: id });
        await audit(c, {
          orgId: actor.orgId,
          actorId: actor.id,
          entity: 'task',
          entityId: id,
          action: 'finalize',
          before: { status: 'on_site' },
          after: { status: 'completed', objectionDeadlineAt: deadline.toISOString() },
        });
        return { report: (await reportOf(c, id))! };
      });
    },

    async getDraft(actor: Actor, id: string) {
      return db.asActor(actor, async (c) => {
        await getRow(c, id, actor.id);
        const { rows } = await c.query<{ content_json: unknown }>(
          'SELECT content_json FROM task_report_drafts WHERE task_id = $1 AND collaborator_id = $2',
          [id, actor.id],
        );
        return { contentJson: rows[0]?.content_json ?? null };
      });
    },

    /** Best-effort server copy of the draft (F7.3). */
    async putDraft(actor: Actor, id: string, contentJson: unknown) {
      await db.asActor(actor, async (c) => {
        const task = await getRow(c, id, actor.id);
        if (!OPEN.includes(task.status)) throw new AppError('INVALID_STATE_TRANSITION');
        await c.query(
          `INSERT INTO task_report_drafts (task_id, collaborator_id, organization_id, content_json) VALUES ($1,$2,$3,$4)
           ON CONFLICT (task_id, collaborator_id) DO UPDATE SET content_json = EXCLUDED.content_json, updated_at = now()`,
          [id, actor.id, actor.orgId, JSON.stringify(contentJson)],
        );
      });
    },
  };
}

export type CollaboratorTasks = ReturnType<typeof createCollaboratorTasks>;
