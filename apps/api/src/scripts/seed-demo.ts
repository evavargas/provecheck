// Loads the minimum data for a presentation: one admin, one collaborator, one client user (with its company),
// one service type and ONE scheduled task assigned to the collaborator. Prints the temporary passwords once.
//   pnpm --filter api seed-demo -- --org "ProveCheck Demo" --admin-email a@x.com --collaborator-email c@x.com --client-email k@x.com
// The client email receives the PDF when the task is finished, so use an address you can read.
import { randomBytes, randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { loadEnv } from '../lib/env.js';
import { createUser } from '../modules/users/create-user.js';
import { createDb } from '../plugins/db.js';
import { createSupabase } from '../plugins/supabase.js';

const { values } = parseArgs({
  options: {
    org: { type: 'string' },
    'admin-email': { type: 'string' },
    'collaborator-email': { type: 'string' },
    'client-email': { type: 'string' },
  },
  args: process.argv.slice(2).filter((a) => a !== '--'),
});
for (const k of ['org', 'admin-email', 'collaborator-email', 'client-email'] as const) {
  if (!values[k]) throw new Error(`missing --${k}`);
}

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const supabase = createSupabase(env);
const password = () => randomBytes(12).toString('base64url');

if ((await db.pool.query('SELECT 1 FROM organizations WHERE name = $1', [values.org])).rowCount) {
  throw new Error(`organization "${values.org}" already exists; the seed runs once`);
}
const orgId = (
  await db.pool.query<{ id: string }>('INSERT INTO organizations (name) VALUES ($1) RETURNING id', [
    values.org,
  ])
).rows[0]!.id;
const companyId = (
  await db.pool.query<{ id: string }>(
    `INSERT INTO client_companies (organization_id, legal_name, address, phone, email) VALUES ($1,'Empresa Demo','Av. 18 de Julio 1234, Montevideo','099000000',$2) RETURNING id`,
    [orgId, values['client-email']],
  )
).rows[0]!.id;
const serviceTypeId = (
  await db.pool.query<{ id: string }>(
    `INSERT INTO service_types (organization_id, name) VALUES ($1,'Limpieza profunda') RETURNING id`,
    [orgId],
  )
).rows[0]!.id;

const people = [
  {
    role: 'admin',
    name: 'Administrador Demo',
    username: 'admin',
    email: values['admin-email']!,
    extra: {},
  },
  {
    role: 'collaborator',
    name: 'Colaborador Demo',
    username: 'colaborador',
    email: values['collaborator-email']!,
    extra: {},
  },
  {
    role: 'client_user',
    name: 'Cliente Demo',
    username: 'cliente',
    email: values['client-email']!,
    extra: { clientCompanyId: companyId },
  },
] as const;

const ids: Record<string, string> = {};
console.log('Temporary passwords (shown once, each person changes it at the first login):');
for (const p of people) {
  const temporaryPassword = password();
  ids[p.role] = await createUser(
    { db, supabase },
    {
      organizationId: orgId,
      role: p.role,
      name: p.name,
      username: p.username,
      email: p.email,
      phone: '099000000',
      temporaryPassword,
      ...p.extra,
    },
  );
  console.log(`  ${p.username.padEnd(12)} ${p.email}  ${temporaryPassword}`);
}

// Tomorrow at 10:00 Montevideo time (13:00 UTC).
const start = new Date();
start.setUTCDate(start.getUTCDate() + 1);
start.setUTCHours(13, 0, 0, 0);
const taskId = randomUUID();
await db.pool.query(
  `INSERT INTO tasks (id, organization_id, client_company_id, address, scheduled_start_at, description, instructions, service_type_id, created_by)
   VALUES ($1,$2,$3,'Av. 18 de Julio 1234, Montevideo',$4,'Limpieza profunda de oficinas','Llevar el kit de limpieza.',$5,$6)`,
  [taskId, orgId, companyId, start, serviceTypeId, ids.admin],
);
await db.pool.query(
  `INSERT INTO task_assignments (organization_id, task_id, collaborator_id) VALUES ($1,$2,$3)`,
  [orgId, taskId, ids.collaborator],
);
console.log(`Task ${taskId} scheduled for ${start.toISOString()}, assigned to "colaborador".`);
await db.pool.end();
