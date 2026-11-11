import type { UserRole } from '@provecheck/shared';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../plugins/db.js';
import type { Supabase } from '../../plugins/supabase.js';

export interface NewUser {
  organizationId: string;
  role: UserRole;
  name: string;
  username: string;
  email: string;
  phone: string;
  temporaryPassword: string;
  clientCompanyId?: string;
}

const USERNAME = /^[a-z0-9._-]{3,30}$/;
const UNIQUE_VIOLATION = '23505';

/** Creates the auth account plus `users` and both `user_identifiers` rows (RN-24, RN-25). No mail is sent. */
export async function createUser(
  deps: { db: Db; supabase: Supabase },
  input: NewUser,
): Promise<string> {
  const username = input.username.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();
  if (!USERNAME.test(username)) throw new AppError('VALIDATION_ERROR', { field: 'username' });

  const taken = await deps.db.pool.query<{ kind: string }>(
    'SELECT kind FROM user_identifiers WHERE identifier = ANY($1::citext[])',
    [[username, email]],
  );
  const conflict = taken.rows[0];
  if (conflict) throw new AppError('IDENTIFIER_TAKEN', { field: conflict.kind });

  const { data, error } = await deps.supabase.admin.auth.admin.createUser({
    email,
    password: input.temporaryPassword,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('auth user was not created');
  const id = data.user.id;

  try {
    await deps.db.tx(async (c) => {
      await c.query(
        `INSERT INTO users (id, organization_id, role, name, username, email, phone, client_company_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          input.organizationId,
          input.role,
          input.name,
          username,
          email,
          input.phone,
          input.clientCompanyId ?? null,
        ],
      );
      await c.query(
        `INSERT INTO user_identifiers (identifier, user_id, kind) VALUES ($1,$2,'username'), ($3,$2,'email')`,
        [username, id, email],
      );
    });
  } catch (err) {
    await deps.supabase.admin.auth.admin.deleteUser(id);
    if ((err as { code?: string }).code === UNIQUE_VIOLATION)
      throw new AppError('IDENTIFIER_TAKEN');
    throw err;
  }
  return id;
}
