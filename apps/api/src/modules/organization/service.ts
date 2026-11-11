import type {
  AuditEntryDto,
  AuditList,
  OrganizationDto,
  UpdateOrganizationInput,
} from '@provecheck/shared';
import { audit } from '../../lib/audit.js';
import type { Env } from '../../lib/env.js';
import { AppError } from '../../lib/errors.js';
import type { Storage } from '../../lib/storage.js';
import type { Actor, Db } from '../../plugins/db.js';

interface OrgRow {
  id: string;
  name: string;
  logo_key: string | null;
  timezone: string;
  default_locale: OrganizationDto['defaultLocale'];
  default_objection_window_hours: number;
}

const COLUMNS = {
  name: 'name',
  timezone: 'timezone',
  defaultLocale: 'default_locale',
  defaultObjectionWindowHours: 'default_objection_window_hours',
} as const;

export const logoKey = (orgId: string, contentType: string) =>
  `org/${orgId}/logo/logo.${contentType === 'image/png' ? 'png' : 'jpg'}`;

export function createOrganizationService(deps: { db: Db; storage: Storage; env: Env }) {
  const { db, storage, env } = deps;

  const toDto = async (r: OrgRow): Promise<OrganizationDto> => ({
    id: r.id,
    name: r.name,
    timezone: r.timezone,
    defaultLocale: r.default_locale,
    defaultObjectionWindowHours: r.default_objection_window_hours,
    logoUrl: r.logo_key ? await storage.signedRead(r.logo_key) : null,
    mail: {
      configured: !!env.SMTP_USER && !!env.SMTP_PASSWORD,
      from: env.MAIL_FROM || env.SMTP_USER,
    },
  });

  const load = async (actor: Actor) => {
    const { rows } = await db.asActor(actor, (c) =>
      c.query<OrgRow>(
        'SELECT id, name, logo_key, timezone, default_locale, default_objection_window_hours FROM organizations',
      ),
    );
    if (!rows[0]) throw new AppError('NOT_FOUND');
    return rows[0];
  };

  return {
    get: async (actor: Actor) => toDto(await load(actor)),

    /** Changing the default window only affects tasks finished afterwards (RN-6): stored deadlines never change. */
    async update(actor: Actor, input: UpdateOrganizationInput): Promise<OrganizationDto> {
      const entries = Object.entries(input).filter(([, v]) => v !== undefined) as [
        keyof typeof COLUMNS,
        unknown,
      ][];
      if (entries.length) {
        await db.asActor(actor, async (c) => {
          const before = (
            await c.query(
              'SELECT name, timezone, default_locale, default_objection_window_hours FROM organizations',
            )
          ).rows[0];
          const sets = entries.map(([k], i) => `${COLUMNS[k]} = $${i + 1}`).join(', ');
          await c.query(
            `UPDATE organizations SET ${sets}`,
            entries.map(([, v]) => v),
          );
          await audit(c, {
            orgId: actor.orgId,
            actorId: actor.id,
            entity: 'organization',
            entityId: actor.orgId,
            action: 'update',
            before,
            after: input,
          });
        });
      }
      return toDto(await load(actor));
    },

    /** Same two-step upload as photos: the client PUTs the file, then confirms so the key is stored. */
    async presignLogo(actor: Actor, contentType: string): Promise<{ uploadUrl: string }> {
      return { uploadUrl: await storage.signedUpload(logoKey(actor.orgId, contentType)) };
    },

    async confirmLogo(actor: Actor, contentType: string): Promise<OrganizationDto> {
      const key = logoKey(actor.orgId, contentType);
      if (!(await storage.exists(key))) throw new AppError('VALIDATION_ERROR', { field: 'logo' });
      await db.asActor(actor, async (c) => {
        await c.query('UPDATE organizations SET logo_key = $1', [key]);
        await audit(c, {
          orgId: actor.orgId,
          actorId: actor.id,
          entity: 'organization',
          entityId: actor.orgId,
          action: 'logo_update',
        });
      });
      return toDto(await load(actor));
    },

    async removeLogo(actor: Actor): Promise<OrganizationDto> {
      const org = await load(actor);
      await db.asActor(actor, async (c) => {
        await c.query('UPDATE organizations SET logo_key = NULL');
        await audit(c, {
          orgId: actor.orgId,
          actorId: actor.id,
          entity: 'organization',
          entityId: actor.orgId,
          action: 'logo_remove',
        });
      });
      if (org.logo_key) await storage.remove([org.logo_key]);
      return toDto(await load(actor));
    },

    /** P-12: newest first, paged by id (a bigserial, so it is monotonic and cheap). */
    async audit(
      actor: Actor,
      q: {
        entity?: string;
        entityId?: string;
        from?: string;
        to?: string;
        limit: number;
        cursor?: number;
      },
    ): Promise<AuditList> {
      const { rows } = await db.asActor(actor, (c) =>
        c.query<{
          id: string;
          created_at: Date;
          actor_name: string | null;
          entity: string;
          entity_id: string;
          action: string;
          before: unknown;
          after: unknown;
        }>(
          `SELECT a.id, a.created_at, u.name AS actor_name, a.entity, a.entity_id, a.action, a.before, a.after
           FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
           WHERE ($1::text IS NULL OR a.entity = $1) AND ($2::text IS NULL OR a.entity_id = $2)
             AND ($3::timestamptz IS NULL OR a.created_at >= $3) AND ($4::timestamptz IS NULL OR a.created_at <= $4)
             AND ($5::bigint IS NULL OR a.id < $5)
           ORDER BY a.id DESC LIMIT $6`,
          [
            q.entity ?? null,
            q.entityId ?? null,
            q.from ?? null,
            q.to ?? null,
            q.cursor ?? null,
            q.limit + 1,
          ],
        ),
      );
      const page = rows.slice(0, q.limit);
      const items: AuditEntryDto[] = page.map((r) => ({
        id: Number(r.id),
        createdAt: r.created_at.toISOString(),
        actorName: r.actor_name,
        entity: r.entity,
        entityId: r.entity_id,
        action: r.action,
        before: r.before,
        after: r.after,
      }));
      return { items, nextCursor: rows.length > q.limit ? items.at(-1)!.id : null };
    },
  };
}
export type OrganizationService = ReturnType<typeof createOrganizationService>;
