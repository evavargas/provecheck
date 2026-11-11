import type pg from 'pg';
import type { Db } from '../plugins/db.js';

export interface Job {
  id: string;
  organizationId: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

/** Adds a job inside the caller's transaction, so it exists only if the surrounding change commits. */
export async function enqueue(
  c: pg.PoolClient,
  orgId: string,
  type: string,
  payload: Record<string, unknown>,
  runAt?: Date,
) {
  await c.query(
    'INSERT INTO jobs (organization_id, type, payload, run_at) VALUES ($1,$2,$3,COALESCE($4, now()))',
    [orgId, type, JSON.stringify(payload), runAt ?? null],
  );
}

type Handler = (job: Job) => Promise<void>;
const LOCK_SECONDS = 120;
// Exponential backoff: 30 s, 1 min, 2 min, 4 min... (spec 9: 5 attempts).
const backoffSeconds = (attempt: number) => 30 * 2 ** (attempt - 1);

export function createWorker(deps: {
  db: Db;
  handlers: Record<string, Handler>;
  log?: { error: (o: object, m: string) => void };
}) {
  const { db, handlers, log } = deps;
  let timer: NodeJS.Timeout | undefined;
  let running = false;

  /** Claims one due job (or a stuck one whose lock expired) and returns it, or null. */
  async function claim(organizationId?: string, type?: string): Promise<Job | null> {
    return db.tx(async (c) => {
      const { rows } = await c.query(
        `SELECT id, organization_id, type, payload, attempts, max_attempts FROM jobs
         WHERE ((status = 'pending' AND run_at <= now()) OR (status = 'running' AND locked_until < now()))
           AND ($1::uuid IS NULL OR organization_id = $1) AND ($2::text IS NULL OR type = $2)
         ORDER BY run_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [organizationId ?? null, type ?? null],
      );
      const r = rows[0];
      if (!r) return null;
      await c.query(
        `UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_until = now() + make_interval(secs => $2) WHERE id = $1`,
        [r.id, LOCK_SECONDS],
      );
      return {
        id: r.id,
        organizationId: r.organization_id as string,
        type: r.type,
        payload: r.payload,
        attempts: r.attempts + 1,
        maxAttempts: r.max_attempts,
      };
    });
  }

  async function finish(job: Job, error?: unknown) {
    if (!error) {
      await db.pool.query(
        `UPDATE jobs SET status = 'done', finished_at = now(), locked_until = NULL WHERE id = $1`,
        [job.id],
      );
      return;
    }
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    const exhausted = job.attempts >= job.maxAttempts;
    await db.pool.query(
      `UPDATE jobs SET status = $2, last_error = $3, locked_until = NULL, run_at = now() + make_interval(secs => $4),
         finished_at = CASE WHEN $2 = 'failed' THEN now() END WHERE id = $1`,
      [job.id, exhausted ? 'failed' : 'pending', message, backoffSeconds(job.attempts)],
    );
  }

  /** Runs due jobs one by one until none is left; returns how many ran. `organizationId` and `type` narrow it (tests). */
  async function runOnce(organizationId?: string, type?: string): Promise<number> {
    let n = 0;
    for (
      let job = await claim(organizationId, type);
      job;
      job = await claim(organizationId, type)
    ) {
      n++;
      try {
        const handler = handlers[job.type];
        if (!handler) throw new Error(`no handler for ${job.type}`);
        await handler(job);
        await finish(job);
      } catch (err) {
        log?.error({ err, jobId: job.id, type: job.type }, 'job failed');
        await finish(job, err);
      }
    }
    return n;
  }

  return {
    runOnce,
    start(intervalMs = 5000, schedule?: () => Promise<void>) {
      timer = setInterval(() => {
        if (running) return;
        running = true;
        (schedule ?? (async () => undefined))()
          .then(() => runOnce())
          .catch((err) => log?.error({ err }, 'worker loop failed'))
          .finally(() => (running = false));
      }, intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
    },
  };
}

export type Worker = ReturnType<typeof createWorker>;
