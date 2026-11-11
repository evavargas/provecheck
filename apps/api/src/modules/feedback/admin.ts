import {
  type AttachmentDto,
  type ObjectionDetailDto,
  type ObjectionRowDto,
  type ObjectionStatus,
  type RatingRowDto,
  type RatingSummaryDto,
  type TaskStatus,
  type UpdateObjectionInput,
} from '@provecheck/shared';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Storage } from '../../lib/storage.js';
import type { Actor, Db } from '../../plugins/db.js';
import { attachmentDtos } from './client.js';

interface ObjRow {
  id: string;
  task_id: string;
  status: ObjectionStatus;
  created_at: Date;
  updated_at: Date;
  description: string;
  internal_notes: string | null;
  age_days: number;
  address: string;
  scheduled_start_at: Date;
  task_status: TaskStatus;
  recipient: string;
  author_name: string;
  author_email: string;
  author_phone: string;
}

const SELECT = `
  SELECT o.id, o.task_id, o.status, o.created_at, o.updated_at, o.description, o.internal_notes,
         floor(extract(epoch FROM now() - o.created_at) / 86400)::int AS age_days,
         t.address, t.scheduled_start_at, t.status AS task_status,
         COALESCE(c.legal_name, cu.name) AS recipient, a.name AS author_name, a.email::text AS author_email, a.phone AS author_phone
  FROM objections o JOIN tasks t ON t.id = o.task_id JOIN users a ON a.id = o.author_id
  LEFT JOIN client_companies c ON c.id = t.client_company_id LEFT JOIN users cu ON cu.id = t.client_user_id`;

const toRow = (r: ObjRow): ObjectionRowDto => ({
  id: r.id,
  taskId: r.task_id,
  status: r.status,
  createdAt: r.created_at.toISOString(),
  ageDays: r.age_days,
  address: r.address,
  recipient: r.recipient,
  author: { name: r.author_name, email: r.author_email, phone: r.author_phone },
});

// The task status follows the objection's management status (spec 8.1, section "Descargos").
const TASK_STATUS: Record<ObjectionStatus, TaskStatus> = {
  open: 'objection_filed',
  in_review: 'in_review',
  resolved: 'resolved',
};

export function createFeedbackAdmin(deps: { db: Db; storage: Storage }) {
  const { db, storage } = deps;

  async function detail(actor: Actor, id: string): Promise<ObjectionDetailDto> {
    const { row, attachments } = await db.asActor(actor, async (c) => {
      const r = await c.query<ObjRow>(`${SELECT} WHERE o.id = $1`, [id]);
      if (!r.rows[0]) throw new AppError('NOT_FOUND');
      const a = await c.query<{
        id: string;
        position: number;
        status: AttachmentDto['status'];
        original_key: string;
        thumb_key: string;
      }>(
        'SELECT id, position, status, original_key, thumb_key FROM objection_attachments WHERE objection_id = $1 ORDER BY position',
        [id],
      );
      return { row: r.rows[0], attachments: a.rows };
    });
    return {
      ...toRow(row),
      description: row.description,
      internalNotes: row.internal_notes,
      updatedAt: row.updated_at.toISOString(),
      scheduledStartAt: row.scheduled_start_at.toISOString(),
      taskStatus: row.task_status,
      attachments: await attachmentDtos(storage, attachments),
    };
  }

  return {
    /** Oldest first, so the longest-waiting objection is on top (P-01, P-05). */
    async listObjections(
      actor: Actor,
      q: {
        status?: ObjectionStatus;
        clientCompanyId?: string;
        from?: string;
        to?: string;
        limit: number;
      },
    ) {
      const { rows } = await db.asActor(actor, (c) =>
        c.query<ObjRow>(
          `${SELECT}
           WHERE ($1::objection_status IS NULL OR o.status = $1) AND ($2::uuid IS NULL OR t.client_company_id = $2)
             AND ($3::timestamptz IS NULL OR o.created_at >= $3) AND ($4::timestamptz IS NULL OR o.created_at <= $4)
           ORDER BY o.created_at ASC LIMIT $5`,
          [q.status ?? null, q.clientCompanyId ?? null, q.from ?? null, q.to ?? null, q.limit],
        ),
      );
      return { items: rows.map(toRow) };
    },

    getObjection: detail,

    async updateObjection(
      actor: Actor,
      id: string,
      input: UpdateObjectionInput,
    ): Promise<ObjectionDetailDto> {
      await db.asActor(actor, async (c) => {
        const found = await c.query<{
          status: ObjectionStatus;
          internal_notes: string | null;
          task_id: string;
        }>('SELECT status, internal_notes, task_id FROM objections WHERE id = $1 FOR UPDATE', [id]);
        const before = found.rows[0];
        if (!before) throw new AppError('NOT_FOUND');
        const status = input.status ?? before.status;
        const notes =
          input.internalNotes === undefined ? before.internal_notes : input.internalNotes || null;
        await c.query('UPDATE objections SET status = $2, internal_notes = $3 WHERE id = $1', [
          id,
          status,
          notes,
        ]);
        if (status !== before.status) {
          await c.query('UPDATE tasks SET status = $2, updated_at = now() WHERE id = $1', [
            before.task_id,
            TASK_STATUS[status],
          ]);
        }
        await audit(c, {
          orgId: actor.orgId,
          actorId: actor.id,
          entity: 'objection',
          entityId: id,
          action: status !== before.status ? 'status_change' : 'notes_update',
          before: { status: before.status, internalNotes: before.internal_notes },
          after: { status, internalNotes: notes },
        });
      });
      return detail(actor, id);
    },

    async listRatings(
      actor: Actor,
      q: { collaboratorId?: string; from?: string; to?: string; limit: number },
    ) {
      const { rows } = await db.asActor(actor, (c) =>
        c.query<{
          id: string;
          stars: number;
          comment: string | null;
          collaborator_id: string;
          collaborator_name: string;
          task_id: string;
          address: string;
          author_name: string;
          created_at: Date;
        }>(
          `SELECT r.id, r.stars, r.comment, a.collaborator_id, u.name AS collaborator_name, a.task_id, t.address, au.name AS author_name, r.created_at
           FROM task_ratings r JOIN task_assignments a ON a.id = r.task_assignment_id JOIN users u ON u.id = a.collaborator_id
           JOIN tasks t ON t.id = a.task_id JOIN users au ON au.id = r.author_id
           WHERE ($1::uuid IS NULL OR a.collaborator_id = $1) AND ($2::timestamptz IS NULL OR r.created_at >= $2) AND ($3::timestamptz IS NULL OR r.created_at <= $3)
           ORDER BY r.created_at DESC LIMIT $4`,
          [q.collaboratorId ?? null, q.from ?? null, q.to ?? null, q.limit],
        ),
      );
      const items: RatingRowDto[] = rows.map((r) => ({
        id: r.id,
        stars: r.stars,
        comment: r.comment,
        collaboratorId: r.collaborator_id,
        collaboratorName: r.collaborator_name,
        taskId: r.task_id,
        address: r.address,
        authorName: r.author_name,
        createdAt: r.created_at.toISOString(),
      }));
      return { items };
    },

    /** Average, count and 1-5 distribution per collaborator (P-10, RN-8). */
    async ratingSummary(
      actor: Actor,
      q: { from?: string; to?: string },
    ): Promise<{ items: RatingSummaryDto[] }> {
      const { rows } = await db.asActor(actor, (c) =>
        c.query<{ collaborator_id: string; name: string; avg: string; n: number; d: number[] }>(
          `SELECT a.collaborator_id, u.name, avg(r.stars)::numeric(3,2)::text AS avg, count(*)::int AS n,
                  ARRAY[count(*) FILTER (WHERE r.stars = 1), count(*) FILTER (WHERE r.stars = 2), count(*) FILTER (WHERE r.stars = 3),
                        count(*) FILTER (WHERE r.stars = 4), count(*) FILTER (WHERE r.stars = 5)]::int[] AS d
           FROM task_ratings r JOIN task_assignments a ON a.id = r.task_assignment_id JOIN users u ON u.id = a.collaborator_id
           WHERE ($1::timestamptz IS NULL OR r.created_at >= $1) AND ($2::timestamptz IS NULL OR r.created_at <= $2)
           GROUP BY a.collaborator_id, u.name ORDER BY avg(r.stars) DESC, u.name`,
          [q.from ?? null, q.to ?? null],
        ),
      );
      return {
        items: rows.map((r) => ({
          collaboratorId: r.collaborator_id,
          collaboratorName: r.name,
          average: Number(r.avg),
          count: r.n,
          distribution: r.d as RatingSummaryDto['distribution'],
        })),
      };
    },
  };
}
export type FeedbackAdmin = ReturnType<typeof createFeedbackAdmin>;
