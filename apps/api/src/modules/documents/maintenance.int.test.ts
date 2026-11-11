import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../../app.js';
import { loadEnv } from '../../lib/env.js';
import { createDb } from '../../plugins/db.js';
import { createStorage } from '../../lib/storage.js';
import { createSupabase } from '../../plugins/supabase.js';
import { ensureDailyJobs } from './maintenance.js';

const run = randomUUID().slice(0, 8);
const env = loadEnv({ ...process.env, LOG_LEVEL: 'silent' });
const db = createDb(env.DATABASE_URL);
const supabase = createSupabase(env);
const storage = createStorage(supabase, env.STORAGE_BUCKET);
let app: App;
let orgId: string;
let userId: string;
let taskId: string;
const keys: string[] = [];

/** Puts a real object in Storage, so the test proves the file is gone and not just the row marked. */
async function object(name: string) {
  const key = `org/${orgId}/test-${run}/${name}.jpg`;
  await storage.upload(key, Buffer.from('x'), 'image/jpeg');
  keys.push(key);
  return key;
}

beforeAll(async () => {
  app = await buildApp(env);
  orgId = (
    await db.pool.query<{ id: string }>(
      'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
      [`Maintenance ${run}`],
    )
  ).rows[0]!.id;
  const { data, error } = await supabase.admin.auth.admin.createUser({
    email: `m.${run}@example.test`,
    password: 'Temporary-pass-1',
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
  await db.pool.query(
    `INSERT INTO users (id, organization_id, role, name, username, email, phone, status) VALUES ($1,$2,'admin','m','m${run}',$3,'1','active')`,
    [userId, orgId, `m.${run}@example.test`],
  );
  taskId = randomUUID();
  await db.pool.query(
    `INSERT INTO tasks (id, organization_id, client_user_id, address, scheduled_start_at, description, created_by) VALUES ($1,$2,$3,'a', now(), 'd', $3)`,
    [taskId, orgId, userId],
  );
});

afterAll(async () => {
  await storage.remove(keys);
  await db.pool.query("DELETE FROM jobs WHERE organization_id IS NULL AND payload ->> 'day' = $1", [
    '2000-01-01',
  ]);
  await db.pool.query('DELETE FROM objection_attachments WHERE organization_id = $1', [orgId]);
  await db.pool.query('DELETE FROM task_photos WHERE organization_id = $1', [orgId]);
  await db.pool.query('DELETE FROM tasks WHERE organization_id = $1', [orgId]);
  await db.pool.query('DELETE FROM user_identifiers WHERE user_id = $1', [userId]);
  await db.pool.query('DELETE FROM users WHERE organization_id = $1', [orgId]);
  await supabase.admin.auth.admin.deleteUser(userId);
  await db.pool.query('DELETE FROM organizations WHERE id = $1', [orgId]);
  await app.close();
});

const photo = async (name: string, status: string, expires: string, created = 'now()') => {
  const [o, t, p] = [
    await object(`${name}-o`),
    await object(`${name}-t`),
    await object(`${name}-p`),
  ];
  const id = randomUUID();
  await db.pool.query(
    `INSERT INTO task_photos (id, organization_id, task_id, uploaded_by, position, original_key, thumb_key, pdf_key, status, expires_at, created_at)
     VALUES ($1,$2,$3,$4,0,$5,$6,$7,$8::photo_status, ${expires}, ${created})`,
    [id, orgId, taskId, userId, o, t, p, status],
  );
  return { id, keys: [o, t, p] };
};

describe('daily jobs', () => {
  it('queues each job once per day and not before its hour', async () => {
    const before = new Date('2000-01-01T05:59:00Z');
    await ensureDailyJobs(db, before);
    expect(
      (
        await db.pool.query(
          `SELECT 1 FROM jobs WHERE organization_id IS NULL AND payload ->> 'day' = '2000-01-01'`,
        )
      ).rowCount,
    ).toBe(0);
    await ensureDailyJobs(db, new Date('2000-01-01T06:00:00Z'));
    await ensureDailyJobs(db, new Date('2000-01-01T18:00:00Z'));
    const { rows } = await db.pool.query(
      `SELECT type FROM jobs WHERE organization_id IS NULL AND payload ->> 'day' = '2000-01-01' ORDER BY type`,
    );
    expect(rows.map((r) => r.type)).toEqual(['cleanup-attachments', 'expire-photos']);
  });
});

describe('expire-photos', () => {
  it('deletes the objects of expired photos and keeps the rest (RN-16)', async () => {
    const old = await photo('old', 'uploaded', "now() - interval '1 day'");
    const fresh = await photo('fresh', 'uploaded', "now() + interval '30 days'");
    await db.pool.query(
      `INSERT INTO jobs (organization_id, type, payload) VALUES (NULL, 'expire-photos', $1)`,
      [JSON.stringify({ day: '2000-01-02' })],
    );
    await app.worker.runOnce(undefined, 'expire-photos');

    const status = async (id: string) =>
      (await db.pool.query('SELECT status FROM task_photos WHERE id = $1', [id])).rows[0].status;
    expect(await status(old.id)).toBe('expired');
    expect(await status(fresh.id)).toBe('uploaded');
    for (const k of old.keys) expect(await storage.exists(k)).toBe(false);
    for (const k of fresh.keys) expect(await storage.exists(k)).toBe(true);
    await db.pool.query(`DELETE FROM jobs WHERE payload ->> 'day' = '2000-01-02'`);
  });
});

describe('cleanup-attachments', () => {
  it('removes uploads that never joined an objection or a record, after a day', async () => {
    const staleKeys = [await object('att-o'), await object('att-t')];
    const stale = randomUUID();
    const recent = randomUUID();
    for (const [id, age] of [
      [stale, '2 days'],
      [recent, '1 hour'],
    ] as const) {
      await db.pool.query(
        `INSERT INTO objection_attachments (id, organization_id, task_id, staging_id, uploaded_by, position, original_key, thumb_key, expires_at, created_at)
         VALUES ($1,$2,$3,gen_random_uuid(),$4,0,$5,$6, now() + interval '100 days', now() - $7::interval)`,
        [id, orgId, taskId, userId, staleKeys[0], staleKeys[1], age],
      );
    }
    const unconfirmed = await photo(
      'unconfirmed',
      'uploading',
      "now() + interval '100 days'",
      "now() - interval '3 days'",
    );
    const confirmed = await photo(
      'confirmed',
      'uploaded',
      "now() + interval '100 days'",
      "now() - interval '3 days'",
    );
    await db.pool.query(
      `INSERT INTO jobs (organization_id, type, payload) VALUES (NULL, 'cleanup-attachments', $1)`,
      [JSON.stringify({ day: '2000-01-03' })],
    );
    await app.worker.runOnce(undefined, 'cleanup-attachments');

    const exists = async (table: string, id: string) =>
      (await db.pool.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id])).rowCount === 1;
    expect(await exists('objection_attachments', stale)).toBe(false);
    expect(await exists('objection_attachments', recent)).toBe(true);
    expect(await exists('task_photos', unconfirmed.id)).toBe(false);
    expect(await exists('task_photos', confirmed.id)).toBe(true);
    for (const k of unconfirmed.keys) expect(await storage.exists(k)).toBe(false);
    for (const k of confirmed.keys) expect(await storage.exists(k)).toBe(true);
    await db.pool.query(`DELETE FROM jobs WHERE payload ->> 'day' = '2000-01-03'`);
  });
});
