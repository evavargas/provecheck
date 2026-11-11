import type { Job } from '../../lib/jobs.js';
import type { Storage } from '../../lib/storage.js';
import type { Db } from '../../plugins/db.js';

const BATCH = 200;
const STALE_HOURS = 24;

/** Daily sweeps (spec 9). Storage has no lifecycle rules, so these jobs delete the objects themselves (RN-16). */
export function createMaintenanceHandlers(deps: { db: Db; storage: Storage }) {
  const { db, storage } = deps;

  /** Removes the objects first, then the row state: a crash in between only repeats work, it never loses a file reference. */
  async function expirePhotos() {
    for (;;) {
      const photos = await db.pool.query<{
        id: string;
        original_key: string;
        thumb_key: string;
        pdf_key: string;
      }>(
        `SELECT id, original_key, thumb_key, pdf_key FROM task_photos WHERE status <> 'expired' AND expires_at < now() LIMIT ${BATCH}`,
      );
      const attachments = await db.pool.query<{
        id: string;
        original_key: string;
        thumb_key: string;
      }>(
        `SELECT id, original_key, thumb_key FROM objection_attachments WHERE status <> 'expired' AND expires_at < now() LIMIT ${BATCH}`,
      );
      if (!photos.rowCount && !attachments.rowCount) return;
      await storage.remove([
        ...photos.rows.flatMap((p) => [p.original_key, p.thumb_key, p.pdf_key]),
        ...attachments.rows.flatMap((a) => [a.original_key, a.thumb_key]),
      ]);
      await db.pool.query(`UPDATE task_photos SET status = 'expired' WHERE id = ANY($1)`, [
        photos.rows.map((p) => p.id),
      ]);
      await db.pool.query(
        `UPDATE objection_attachments SET status = 'expired' WHERE id = ANY($1)`,
        [attachments.rows.map((a) => a.id)],
      );
    }
  }

  /** Uploads that never became part of anything: attachments without an objection and photos never confirmed. */
  async function cleanupStale() {
    for (;;) {
      const attachments = await db.pool.query<{
        id: string;
        original_key: string;
        thumb_key: string;
      }>(
        `SELECT id, original_key, thumb_key FROM objection_attachments
         WHERE objection_id IS NULL AND created_at < now() - make_interval(hours => ${STALE_HOURS}) LIMIT ${BATCH}`,
      );
      const photos = await db.pool.query<{
        id: string;
        original_key: string;
        thumb_key: string;
        pdf_key: string;
      }>(
        `SELECT id, original_key, thumb_key, pdf_key FROM task_photos
         WHERE status = 'uploading' AND created_at < now() - make_interval(hours => ${STALE_HOURS}) LIMIT ${BATCH}`,
      );
      if (!attachments.rowCount && !photos.rowCount) return;
      await storage.remove([
        ...attachments.rows.flatMap((a) => [a.original_key, a.thumb_key]),
        ...photos.rows.flatMap((p) => [p.original_key, p.thumb_key, p.pdf_key]),
      ]);
      await db.pool.query('DELETE FROM objection_attachments WHERE id = ANY($1)', [
        attachments.rows.map((a) => a.id),
      ]);
      await db.pool.query('DELETE FROM task_photos WHERE id = ANY($1)', [
        photos.rows.map((p) => p.id),
      ]);
    }
  }

  return {
    'expire-photos': (_job: Job) => expirePhotos(),
    'cleanup-attachments': (_job: Job) => cleanupStale(),
  };
}

// Montevideo is UTC-3 all year; 06:00 UTC is 03:00 there (spec 9: expire-photos at 03:00).
export const DAILY_JOBS: { type: string; hourUtc: number }[] = [
  { type: 'expire-photos', hourUtc: 6 },
  { type: 'cleanup-attachments', hourUtc: 6 },
];

/** Queues today's run of each daily job once its hour has passed. Safe to call every minute from any instance. */
export async function ensureDailyJobs(db: Db, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  for (const { type, hourUtc } of DAILY_JOBS) {
    if (now.getUTCHours() < hourUtc) continue;
    await db.pool.query(
      `INSERT INTO jobs (organization_id, type, payload) VALUES (NULL, $1, $2) ON CONFLICT DO NOTHING`,
      [type, JSON.stringify({ day })],
    );
  }
}
