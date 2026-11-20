// Adds presentation data on top of `seed-demo`: a second collaborator, two companies, two service types and tasks for
// tomorrow and the day after (Montevideo time, UTC-3). Prints the new temporary password once.
//   pnpm --filter api seed-demo-more -- --org "ProveCheck Demo" --collaborator2-email c2@x.com --company2-email a@x.com --company3-email b@x.com
import { randomBytes, randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { loadEnv } from '../lib/env.js';
import { createUser } from '../modules/users/create-user.js';
import { createDb } from '../plugins/db.js';
import { createSupabase } from '../plugins/supabase.js';

const { values } = parseArgs({
  options: {
    org: { type: 'string' },
    'collaborator2-email': { type: 'string' },
    'company2-email': { type: 'string' },
    'company3-email': { type: 'string' },
  },
  args: process.argv.slice(2).filter((a) => a !== '--'),
});
for (const k of ['org', 'collaborator2-email', 'company2-email', 'company3-email'] as const)
  if (!values[k]) throw new Error(`missing --${k}`);

const db = createDb(loadEnv().DATABASE_URL);
const supabase = createSupabase(loadEnv());
const one = async <T extends Record<string, unknown>>(sql: string, params: unknown[]) =>
  (await db.pool.query<T>(sql, params)).rows[0]!;

const orgId = (
  await one<{ id: string }>('SELECT id FROM organizations WHERE name = $1', [values.org])
).id;
const admin = (
  await one<{ id: string }>(
    `SELECT id FROM users WHERE organization_id = $1 AND role = 'admin' LIMIT 1`,
    [orgId],
  )
).id;
const collab1 = (
  await one<{ id: string }>(
    `SELECT id FROM users WHERE organization_id = $1 AND username = 'colaborador'`,
    [orgId],
  )
).id;
const demoCompany = (
  await one<{ id: string }>(
    `SELECT id FROM client_companies WHERE organization_id = $1 AND legal_name = 'Empresa Demo'`,
    [orgId],
  )
).id;
const cleaning = (
  await one<{ id: string }>(
    `SELECT id FROM service_types WHERE organization_id = $1 AND name = 'Limpieza profunda'`,
    [orgId],
  )
).id;

const temporaryPassword = randomBytes(12).toString('base64url');
const collab2 = await createUser(
  { db, supabase },
  {
    organizationId: orgId,
    role: 'collaborator',
    name: 'Colaborador Demo 2',
    username: 'colaborador2',
    email: values['collaborator2-email']!,
    phone: '099000001',
    temporaryPassword,
  },
);

const company = async (name: string, address: string, email: string) =>
  (
    await one<{ id: string }>(
      `INSERT INTO client_companies (organization_id, legal_name, address, phone, email) VALUES ($1,$2,$3,'099000002',$4) RETURNING id`,
      [orgId, name, address, email],
    )
  ).id;
const service = async (name: string) =>
  (
    await one<{ id: string }>(
      `INSERT INTO service_types (organization_id, name) VALUES ($1,$2) RETURNING id`,
      [orgId, name],
    )
  ).id;
const supermarket = await company(
  'Supermercado Central',
  'Bulevar Artigas 2500, Montevideo',
  values['company2-email']!,
);
const clinic = await company(
  'Clínica Sur',
  'Av. Italia 3100, Montevideo',
  values['company3-email']!,
);
const pests = await service('Control de plagas');
const aircon = await service('Mantenimiento de aire acondicionado');

/** Local Montevideo date `days` from now at hh:mm, as a UTC instant (UTC-3 all year). */
const at = (days: number, hh: number, mm = 0) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo' }).format(
    new Date(),
  );
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hh + 3, mm, 0, 0);
  return d;
};

const tasks = [
  {
    when: at(1, 8, 30),
    company: demoCompany,
    address: 'Av. 18 de Julio 1234, Montevideo',
    service: cleaning,
    hours: 3,
    desc: 'Limpieza profunda de oficinas, piso 3',
    cost: 4500,
    team: [[collab1, 900]],
  },
  {
    when: at(1, 11),
    company: supermarket,
    address: 'Bulevar Artigas 2500, Montevideo',
    service: pests,
    hours: 2,
    desc: 'Control preventivo de plagas en depósito y cámaras',
    cost: 3200,
    team: [[collab2, 800]],
  },
  {
    when: at(1, 15),
    company: clinic,
    address: 'Av. Italia 3100, Montevideo',
    service: aircon,
    hours: 4,
    desc: 'Mantenimiento de 6 equipos de aire acondicionado',
    cost: 7800,
    team: [
      [collab1, 1200],
      [collab2, 1200],
    ],
  },
  {
    when: at(2, 9),
    company: clinic,
    address: 'Av. Italia 3100, Montevideo',
    service: cleaning,
    hours: 3,
    desc: 'Limpieza profunda de sala de espera y consultorios',
    cost: 4800,
    team: [[collab2, 950]],
  },
  {
    when: at(2, 14),
    company: supermarket,
    address: 'Bulevar Artigas 2500, Montevideo',
    service: pests,
    hours: 2,
    desc: 'Segunda visita de control de plagas',
    cost: 3200,
    team: [[collab1, 800]],
  },
] as const;

for (const t of tasks) {
  const id = randomUUID();
  await db.pool.query(
    `INSERT INTO tasks (id, organization_id, client_company_id, address, scheduled_start_at, assigned_hours, description, service_type_id, cost_uyu, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, orgId, t.company, t.address, t.when, t.hours, t.desc, t.service, t.cost, admin],
  );
  for (const [collaborator, fee] of t.team) {
    await db.pool.query(
      `INSERT INTO task_assignments (organization_id, task_id, collaborator_id, collaborator_fee_uyu) VALUES ($1,$2,$3,$4)`,
      [orgId, id, collaborator, fee],
    );
  }
}
console.log(
  `colaborador2 ${values['collaborator2-email']}  temporary password (shown once): ${temporaryPassword}`,
);
console.log(`${tasks.length} tasks added.`);
await db.pool.end();
