import {
  MAX_OBJECTION_ATTACHMENTS,
  type AttachmentDto,
  type ClientObjectionDto,
  type ClientTaskDto,
  type ClientTaskList,
  type FileObjectionInput,
  type PresignAttachmentInput,
  type PresignedAttachmentDto,
  type RatingWrite,
  type TaskStatus,
} from '@provecheck/shared';
import type pg from 'pg';
import { AppError } from '../../lib/errors.js';
import type { Storage } from '../../lib/storage.js';
import type { Actor, Db } from '../../plugins/db.js';

interface Row {
  id: string;
  status: TaskStatus;
  address: string;
  recipient_name: string | null;
  scheduled_start_at: Date;
  completed_at: Date | null;
  service_type_name: string | null;
  company_name: string | null;
  objection_deadline_at: Date | null;
  closed: boolean;
  can_object: boolean;
  can_rate: boolean;
  team: ClientTaskDto['team'];
}

// tasks_public hides costs; the team comes through a function that never returns fees (RN-13); ratings are only the caller's.
// The windows are computed by the database clock, so a wrong phone clock cannot reopen them (RN-6).
const SELECT = `
  SELECT t.id, t.status, t.address, t.recipient_name, t.scheduled_start_at, t.completed_at, st.name AS service_type_name,
         c.legal_name AS company_name, t.objection_deadline_at,
         COALESCE(now() > t.objection_deadline_at, false) AS closed,
         COALESCE(t.status = 'completed' AND now() <= t.objection_deadline_at
                  AND NOT EXISTS (SELECT 1 FROM objections o WHERE o.task_id = t.id), false) AS can_object,
         COALESCE(t.status IN ('completed','objection_filed','in_review','resolved') AND now() <= t.objection_deadline_at, false) AS can_rate,
         COALESCE((
           SELECT json_agg(json_build_object('assignmentId', m.assignment_id, 'name', m.name, 'arrivedAt', m.arrived_at,
                  'attendanceDelayed', m.attendance_delayed,
                  'myRating', (SELECT json_build_object('stars', r.stars, 'comment', r.comment) FROM task_ratings r
                               WHERE r.task_assignment_id = m.assignment_id AND r.author_id = app.uid())))
           FROM app.task_team(t.id) m WHERE m.active), '[]') AS team
  FROM tasks_public t
  LEFT JOIN service_types st ON st.id = t.service_type_id
  LEFT JOIN client_companies c ON c.id = t.client_company_id`;

const BUSINESS_ERRORS = new Set([
  'FORBIDDEN',
  'NOT_FOUND',
  'OBJECTION_ALREADY_EXISTS',
  'INVALID_STATE_TRANSITION',
  'OBJECTION_WINDOW_CLOSED',
  'VALIDATION_ERROR',
  'ATTACHMENT_LIMIT_EXCEEDED',
  'PHOTOS_NOT_CONFIRMED',
]);

export const attachmentKeys = (orgId: string, taskId: string, attachmentId: string) => {
  const base = `org/${orgId}/tasks/${taskId}/objection/${attachmentId}`;
  return { original: `${base}/original.jpg`, thumb: `${base}/thumb.jpg` };
};

/** Signed read URLs for attachments; an expired one carries none (RN-21). */
export async function attachmentDtos(
  storage: Storage,
  rows: {
    id: string;
    position: number;
    status: AttachmentDto['status'];
    original_key: string;
    thumb_key: string;
  }[],
): Promise<AttachmentDto[]> {
  return Promise.all(
    rows.map(async (a) => ({
      id: a.id,
      position: a.position,
      status: a.status,
      thumbUrl: a.status === 'uploaded' ? await storage.signedRead(a.thumb_key) : null,
      originalUrl: a.status === 'uploaded' ? await storage.signedRead(a.original_key) : null,
    })),
  );
}

export function createClientTasks(deps: { db: Db; storage: Storage }) {
  const { db, storage } = deps;

  const toDto = (r: Row, objection: ClientObjectionDto | null): ClientTaskDto => ({
    id: r.id,
    status: r.status,
    address: r.address,
    recipientName: r.recipient_name,
    scheduledStartAt: r.scheduled_start_at.toISOString(),
    completedAt: r.completed_at?.toISOString() ?? null,
    serviceTypeName: r.service_type_name,
    clientCompanyName: r.company_name,
    objectionDeadlineAt: r.objection_deadline_at?.toISOString() ?? null,
    canFileObjection: r.can_object,
    canRate: r.can_rate,
    closed: r.closed,
    team: r.team,
    objection,
  });

  async function objectionOf(c: pg.PoolClient, taskId: string): Promise<ClientObjectionDto | null> {
    const o = await c.query<{
      id: string;
      description: string;
      status: ClientObjectionDto['status'];
      created_at: Date;
    }>('SELECT id, description, status, created_at FROM objections WHERE task_id = $1', [taskId]);
    if (!o.rows[0]) return null;
    const a = await c.query<{
      id: string;
      position: number;
      status: AttachmentDto['status'];
      original_key: string;
      thumb_key: string;
    }>(
      `SELECT id, position, status, original_key, thumb_key FROM objection_attachments WHERE objection_id = $1 ORDER BY position`,
      [o.rows[0].id],
    );
    return {
      description: o.rows[0].description,
      status: o.rows[0].status,
      createdAt: o.rows[0].created_at.toISOString(),
      attachments: await attachmentDtos(storage, a.rows),
    };
  }

  async function get(c: pg.PoolClient, id: string): Promise<ClientTaskDto> {
    const { rows } = await c.query<Row>(`${SELECT} WHERE t.id = $1`, [id]);
    if (!rows[0]) throw new AppError('NOT_FOUND');
    return toDto(rows[0], await objectionOf(c, id));
  }

  return {
    /** Newest first; closed and cancelled services stay visible (RN-20). */
    async list(actor: Actor): Promise<ClientTaskList> {
      const { rows } = await db.asActor(actor, (c) =>
        c.query<Row>(`${SELECT} ORDER BY t.scheduled_start_at DESC, t.id LIMIT 100`),
      );
      return { items: rows.map((r) => toDto(r, null)) };
    },

    get: (actor: Actor, id: string) => db.asActor(actor, (c) => get(c, id)),

    async presignAttachment(
      actor: Actor,
      taskId: string,
      input: PresignAttachmentInput,
    ): Promise<PresignedAttachmentDto> {
      const keys = attachmentKeys(actor.orgId, taskId, input.attachmentId);
      await db.asActor(actor, async (c) => {
        const task = await get(c, taskId);
        if (!task.canFileObjection)
          throw new AppError(task.closed ? 'OBJECTION_WINDOW_CLOSED' : 'INVALID_STATE_TRANSITION');
        const existing = await c.query(
          'SELECT uploaded_by FROM objection_attachments WHERE id = $1',
          [input.attachmentId],
        );
        if (existing.rows[0]) {
          if (existing.rows[0].uploaded_by !== actor.id) throw new AppError('FORBIDDEN');
          return;
        }
        const count = await c.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM objection_attachments WHERE staging_id = $1',
          [input.stagingId],
        );
        if (count.rows[0]!.n >= MAX_OBJECTION_ATTACHMENTS)
          throw new AppError('ATTACHMENT_LIMIT_EXCEEDED');
        await c.query(
          `INSERT INTO objection_attachments (id, organization_id, task_id, staging_id, uploaded_by, position, original_key, thumb_key, bytes, sha256, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() + interval '180 days')`,
          [
            input.attachmentId,
            actor.orgId,
            taskId,
            input.stagingId,
            actor.id,
            input.position,
            keys.original,
            keys.thumb,
            input.bytes,
            input.sha256 ?? null,
          ],
        );
      });
      const [original, thumb] = await Promise.all([
        storage.signedUpload(keys.original),
        storage.signedUpload(keys.thumb),
      ]);
      return { attachmentId: input.attachmentId, uploads: { original, thumb } };
    },

    async confirmAttachment(actor: Actor, taskId: string, attachmentId: string): Promise<void> {
      const keys = attachmentKeys(actor.orgId, taskId, attachmentId);
      await db.asActor(actor, async (c) => {
        const row = await c.query(
          'SELECT 1 FROM objection_attachments WHERE id = $1 AND task_id = $2 AND uploaded_by = $3',
          [attachmentId, taskId, actor.id],
        );
        if (!row.rowCount) throw new AppError('NOT_FOUND');
      });
      const found = await Promise.all([keys.original, keys.thumb].map((k) => storage.exists(k)));
      if (found.some((f) => !f)) throw new AppError('PHOTOS_NOT_CONFIRMED');
      await db.asActor(actor, (c) =>
        c.query(
          `UPDATE objection_attachments SET status = 'uploaded' WHERE id = $1 AND status = 'uploading'`,
          [attachmentId],
        ),
      );
    },

    /** F11: every rule lives in `app.file_objection`; here its plain messages become stable error codes. */
    async fileObjection(
      actor: Actor,
      taskId: string,
      input: FileObjectionInput & { attachmentIds: string[] },
    ): Promise<ClientTaskDto> {
      return db.asActor(actor, async (c) => {
        try {
          await c.query('SELECT app.file_objection($1,$2,$3,$4)', [
            taskId,
            input.stagingId,
            input.description,
            input.attachmentIds,
          ]);
        } catch (err) {
          const e = err as { message?: string; code?: string };
          if (e.code === '23505') throw new AppError('OBJECTION_ALREADY_EXISTS');
          if (e.message && BUSINESS_ERRORS.has(e.message)) throw new AppError(e.message as never);
          throw err;
        }
        return get(c, taskId);
      });
    },

    /** F13: one rating per collaborator per task, editable while the window is open (RN-8). */
    async rate(
      actor: Actor,
      taskId: string,
      assignmentId: string,
      input: RatingWrite,
    ): Promise<ClientTaskDto> {
      return db.asActor(actor, async (c) => {
        const task = await get(c, taskId);
        if (!task.team.some((m) => m.assignmentId === assignmentId))
          throw new AppError('NOT_FOUND');
        if (!task.canRate)
          throw new AppError(task.closed ? 'RATING_WINDOW_CLOSED' : 'INVALID_STATE_TRANSITION');
        await c.query(
          `INSERT INTO task_ratings (organization_id, task_assignment_id, author_id, stars, comment)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (task_assignment_id, author_id) DO UPDATE SET stars = EXCLUDED.stars, comment = EXCLUDED.comment, edited_at = now()`,
          [actor.orgId, assignmentId, actor.id, input.stars, input.comment ?? null],
        );
        return get(c, taskId);
      });
    },
  };
}
export type ClientTasks = ReturnType<typeof createClientTasks>;
