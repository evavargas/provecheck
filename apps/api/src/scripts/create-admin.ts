// Creates the first administrator (spec F1). Prints the temporary password once.
//   pnpm --filter api create-admin -- --org "My Company" --name "Eva" --username eva --email eva@x.com --phone 099123456
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { loadEnv } from '../lib/env.js';
import { createUser } from '../modules/users/create-user.js';
import { createDb } from '../plugins/db.js';
import { createSupabase } from '../plugins/supabase.js';

const { values } = parseArgs({
  options: {
    org: { type: 'string' },
    name: { type: 'string' },
    username: { type: 'string' },
    email: { type: 'string' },
    phone: { type: 'string' },
  },
  args: process.argv.slice(2).filter((a) => a !== '--'),
});
for (const k of ['org', 'name', 'username', 'email', 'phone'] as const) {
  if (!values[k]) throw new Error(`missing --${k}`);
}

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const supabase = createSupabase(env);
const temporaryPassword = randomBytes(12).toString('base64url');

const org = await db.pool.query<{ id: string }>(
  `INSERT INTO organizations (name) SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM organizations) RETURNING id`,
  [values.org],
);
const organizationId =
  org.rows[0]?.id ??
  (await db.pool.query<{ id: string }>('SELECT id FROM organizations LIMIT 1')).rows[0]!.id;

await createUser(
  { db, supabase },
  {
    organizationId,
    role: 'admin',
    name: values.name!,
    username: values.username!,
    email: values.email!,
    phone: values.phone!,
    temporaryPassword,
  },
);
console.log(`Administrator created. Temporary password (shown once): ${temporaryPassword}`);
await db.pool.end();
