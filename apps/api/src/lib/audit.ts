import type pg from 'pg';

/** RN-19: every sensitive change leaves a row. Call it inside the same transaction as the change. */
export async function audit(
  c: pg.PoolClient,
  e: {
    orgId: string;
    actorId: string | null;
    entity: string;
    entityId: string;
    action: string;
    before?: unknown;
    after?: unknown;
  },
) {
  await c.query(
    `INSERT INTO audit_log (organization_id, actor_id, entity, entity_id, action, before, after)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [e.orgId, e.actorId, e.entity, e.entityId, e.action, e.before ?? null, e.after ?? null],
  );
}
