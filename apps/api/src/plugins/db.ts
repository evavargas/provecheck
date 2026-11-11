import pg from 'pg';
import type { UserRole } from '@provecheck/shared';

export interface Actor {
  id: string;
  orgId: string;
  role: UserRole;
}

export interface Db {
  pool: pg.Pool;
  /** Runs as the table owner: bypasses RLS. Only for pre-auth lookups, workers and admin tooling. */
  tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T>;
  /** Runs under the `api_rls` role with the actor's identity, so row level security applies. */
  asActor<T>(actor: Actor, fn: (c: pg.PoolClient) => Promise<T>): Promise<T>;
}

export function createDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 10 });

  const tx: Db['tx'] = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  };

  const asActor: Db['asActor'] = (actor, fn) =>
    tx(async (c) => {
      await c.query('SET LOCAL ROLE api_rls');
      await c.query(
        `SELECT set_config('app.user_id', $1, true), set_config('app.org_id', $2, true), set_config('app.role', $3, true)`,
        [actor.id, actor.orgId, actor.role],
      );
      return fn(c);
    });

  return { pool, tx, asActor };
}
