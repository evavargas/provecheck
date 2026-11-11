import type {
  FirstLoginInput,
  LoginResponse,
  MeDto,
  PreferencesInput,
  SessionDto,
} from '@provecheck/shared';
import type { Session } from '@supabase/supabase-js';
import { AppError } from '../../lib/errors.js';
import type { Actor, Db } from '../../plugins/db.js';
import type { Supabase } from '../../plugins/supabase.js';

const UNIQUE_VIOLATION = '23505';
// Used when the identifier does not exist, so the response time does not reveal it.
const DUMMY_EMAIL = 'nobody@invalid.provecheck.test';

interface UserRow {
  id: string;
  organization_id: string;
  role: MeDto['role'];
  name: string;
  username: string;
  email: string;
  phone: string;
  status: 'active' | 'inactive' | 'pending_first_login';
  must_change_password: boolean;
  theme: MeDto['theme'];
  locale: MeDto['locale'];
}

export interface AuthContext extends Actor {
  mustChangePassword: boolean;
}

const toMe = (u: UserRow): MeDto => ({
  id: u.id,
  name: u.name,
  username: u.username,
  email: u.email,
  phone: u.phone,
  role: u.role,
  theme: u.theme,
  locale: u.locale,
  mustChangePassword: u.must_change_password,
});

const toSession = (s: Session): SessionDto => ({
  accessToken: s.access_token,
  refreshToken: s.refresh_token,
  expiresAt: s.expires_at ?? Math.floor(Date.now() / 1000) + s.expires_in,
});

export function createAuthService(deps: { db: Db; supabase: Supabase }) {
  const { db, supabase } = deps;

  const findByIdentifier = async (identifier: string) =>
    (
      await db.pool.query<UserRow>(
        `SELECT u.* FROM user_identifiers i JOIN users u ON u.id = i.user_id WHERE i.identifier = $1`,
        [identifier],
      )
    ).rows[0];

  const findById = async (id: string) =>
    (await db.pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [id])).rows[0];

  /** Returns the session, or null when the credentials are wrong. */
  const signIn = async (email: string, password: string): Promise<Session | null> => {
    const { data, error } = await supabase.anon().auth.signInWithPassword({ email, password });
    if (error) {
      if (error.status === 400) return null;
      throw error;
    }
    return data.session;
  };

  return {
    async login(identifier: string, password: string): Promise<LoginResponse> {
      const user = await findByIdentifier(identifier);
      const session = await signIn(user?.email ?? DUMMY_EMAIL, password);
      if (!user || !session) throw new AppError('INVALID_CREDENTIALS');
      if (user.status === 'inactive') {
        await supabase.admin.auth.admin.signOut(session.access_token);
        throw new AppError('ACCOUNT_INACTIVE');
      }
      return {
        session: toSession(session),
        user: toMe(user),
        mustChangePassword: user.must_change_password,
      };
    },

    /** Validates the bearer token and loads the actor. */
    async authenticate(token: string): Promise<AuthContext> {
      const { data, error } = await supabase.admin.auth.getUser(token);
      if (error || !data.user) throw new AppError('UNAUTHORIZED');
      const user = await findById(data.user.id);
      if (!user) throw new AppError('UNAUTHORIZED');
      if (user.status === 'inactive') throw new AppError('ACCOUNT_INACTIVE');
      return {
        id: user.id,
        orgId: user.organization_id,
        role: user.role,
        mustChangePassword: user.must_change_password,
      };
    },

    async me(id: string): Promise<MeDto> {
      const user = await findById(id);
      if (!user) throw new AppError('UNAUTHORIZED');
      return toMe(user);
    },

    async firstLogin(actorId: string, input: FirstLoginInput): Promise<MeDto> {
      return db.tx(async (c) => {
        const { rows } = await c.query<UserRow>('SELECT * FROM users WHERE id = $1 FOR UPDATE', [
          actorId,
        ]);
        const user = rows[0];
        if (!user?.must_change_password) throw new AppError('FORBIDDEN');

        // The temporary password still signs in, so a match means the new one is not new.
        if (await signIn(user.email, input.newPassword)) {
          throw new AppError('VALIDATION_ERROR', {
            field: 'newPassword',
            reason: 'same_as_temporary',
          });
        }

        if (input.email !== user.email.toLowerCase()) {
          try {
            await c.query(
              `UPDATE user_identifiers SET identifier = $1 WHERE user_id = $2 AND kind = 'email'`,
              [input.email, actorId],
            );
          } catch (err) {
            if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
              throw new AppError('IDENTIFIER_TAKEN', { field: 'email' });
            }
            throw err;
          }
        }
        const updated = await c.query<UserRow>(
          `UPDATE users SET email = $1, email_confirmed_at = now(), password_changed_at = now(),
             must_change_password = false, status = 'active' WHERE id = $2 RETURNING *`,
          [input.email, actorId],
        );
        await c.query(
          `INSERT INTO audit_log (organization_id, actor_id, entity, entity_id, action) VALUES ($1,$2,'user',$3,'first_login')`,
          [user.organization_id, actorId, actorId],
        );
        // Last step before COMMIT: if Supabase fails, the database changes roll back.
        const { error } = await supabase.admin.auth.admin.updateUserById(actorId, {
          email: input.email,
          password: input.newPassword,
          email_confirm: true,
        });
        if (error) throw error;
        return toMe(updated.rows[0]!);
      });
    },

    async changePassword(
      actorId: string,
      currentPassword: string,
      newPassword: string,
    ): Promise<void> {
      const user = await findById(actorId);
      if (!user || !(await signIn(user.email, currentPassword)))
        throw new AppError('INVALID_CREDENTIALS');
      if (currentPassword === newPassword) {
        throw new AppError('VALIDATION_ERROR', { field: 'newPassword', reason: 'same_as_current' });
      }
      const { error } = await supabase.admin.auth.admin.updateUserById(actorId, {
        password: newPassword,
      });
      if (error) throw error;
      await db.pool.query('UPDATE users SET password_changed_at = now() WHERE id = $1', [actorId]);
    },

    async refresh(refreshToken: string): Promise<LoginResponse> {
      const { data, error } = await supabase
        .anon()
        .auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session || !data.user) throw new AppError('UNAUTHORIZED');
      const user = await findById(data.user.id);
      if (!user) throw new AppError('UNAUTHORIZED');
      if (user.status === 'inactive') throw new AppError('ACCOUNT_INACTIVE');
      return {
        session: toSession(data.session),
        user: toMe(user),
        mustChangePassword: user.must_change_password,
      };
    },

    async logout(token: string): Promise<void> {
      await supabase.admin.auth.admin.signOut(token);
    },

    /** Goes through RLS (`self_update`), unlike the owner-role queries above. */
    async updatePreferences(actor: Actor, input: PreferencesInput): Promise<MeDto> {
      return db.asActor(actor, async (c) => {
        const { rows } = await c.query<UserRow>(
          `UPDATE users SET theme = COALESCE($2, theme),
             locale = CASE WHEN $3::boolean THEN $4 ELSE locale END
           WHERE id = $1 RETURNING *`,
          [actor.id, input.theme ?? null, input.locale !== undefined, input.locale ?? null],
        );
        if (!rows[0]) throw new AppError('NOT_FOUND');
        return toMe(rows[0]);
      });
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
