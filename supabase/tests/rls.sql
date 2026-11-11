-- Run with: pnpm db:test   (rolls back; leaves no data)
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Org A'),
  ('00000000-0000-0000-0000-0000000000b1', 'Org B');
INSERT INTO client_companies (id, organization_id, legal_name) VALUES
  ('00000000-0000-0000-0000-00000000c0a1', '00000000-0000-0000-0000-0000000000a1', 'Company A1'),
  ('00000000-0000-0000-0000-00000000c0a2', '00000000-0000-0000-0000-0000000000a1', 'Company A2'),
  ('00000000-0000-0000-0000-00000000c0b1', '00000000-0000-0000-0000-0000000000b1', 'Company B1');

INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000d2'),
  ('00000000-0000-0000-0000-0000000000d3'), ('00000000-0000-0000-0000-0000000000d4'),
  ('00000000-0000-0000-0000-0000000000d5');
INSERT INTO users (id, organization_id, role, name, username, email, phone, client_company_id) VALUES
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'admin', 'Admin', 'admin1', 'admin@a.test', '1', NULL),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1', 'collaborator', 'Collab 1', 'collab1', 'c1@a.test', '2', NULL),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000a1', 'collaborator', 'Collab 2', 'collab2', 'c2@a.test', '3', NULL),
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000a1', 'client_user', 'Client A1', 'clienta1', 'a1@a.test', '4', '00000000-0000-0000-0000-00000000c0a1'),
  ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000a1', 'client_user', 'Client A2', 'clienta2', 'a2@a.test', '5', '00000000-0000-0000-0000-00000000c0a2');

INSERT INTO tasks (id, organization_id, client_company_id, address, scheduled_start_at, description, cost_uyu, status, completed_at, objection_deadline_at, created_by) VALUES
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000c0a1', 'Street 1', now(), 'open task', 100, 'completed', now(), now() + interval '1 day', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000c0a2', 'Street 2', now(), 'other company', 200, 'completed', now() - interval '3 days', now() - interval '1 day', '00000000-0000-0000-0000-0000000000d1');
INSERT INTO task_assignments (organization_id, task_id, collaborator_id, collaborator_fee_uyu) VALUES
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d2', 50);

CREATE FUNCTION pg_temp.act_as(p_user uuid, p_role text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('app.user_id', p_user::text, true);
  PERFORM set_config('app.org_id', '00000000-0000-0000-0000-0000000000a1', true);
  PERFORM set_config('app.role', p_role, true);
  SET LOCAL ROLE api_rls;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.act_as(uuid, text) TO PUBLIC;

DO $$
DECLARE n int; failed boolean;
BEGIN
  -- clients only see their own company's tasks
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000d4', 'client_user');
  SELECT count(*) INTO n FROM tasks;
  ASSERT n = 1, format('client A1 should see 1 task, saw %s', n);

  -- collaborators see assigned tasks only and never the assignments table
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000d2', 'collaborator');
  SELECT count(*) INTO n FROM tasks;
  ASSERT n = 1, format('collab 1 should see 1 task, saw %s', n);
  SELECT count(*) INTO n FROM task_assignments;
  ASSERT n = 0, 'collaborator must not read task_assignments';
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000d3', 'collaborator');
  SELECT count(*) INTO n FROM tasks;
  ASSERT n = 0, 'unassigned collaborator must see no tasks';

  -- admin sees everything in the org, but not other orgs' companies
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000d1', 'admin');
  SELECT count(*) INTO n FROM tasks;
  ASSERT n = 2, 'admin should see 2 tasks';
  SELECT count(*) INTO n FROM client_companies;
  ASSERT n = 2, format('admin should see 2 companies, saw %s', n);

  -- objections: inside the window yes, after it no
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000d4', 'client_user');
  INSERT INTO objections (organization_id, task_id, author_id, description)
    VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d4', 'valid objection');
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000d5', 'client_user');
  failed := false;
  BEGIN
    INSERT INTO objections (organization_id, task_id, author_id, description)
      VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d5', 'too late');
  EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
  ASSERT failed, 'objection after the deadline must be rejected';

  -- Supabase client roles have no access at all
  RESET ROLE;
  SET LOCAL ROLE anon;
  failed := false;
  BEGIN PERFORM 1 FROM tasks; EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
  ASSERT failed, 'anon must not read tasks';
  RESET ROLE;
END $$;

-- tasks_public hides cost
DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks_public' AND column_name = 'cost_uyu'),
    'tasks_public must not expose cost_uyu';
END $$;

-- immutability and caps
INSERT INTO task_reports (id, organization_id, task_id, content_json, content_html, completed_by, device_completed_at, device_sent_at)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', '{}', '<p>x</p>',
          '00000000-0000-0000-0000-0000000000d2', now(), now());
DO $$
DECLARE failed boolean := false; i int;
BEGIN
  BEGIN UPDATE task_reports SET content_html = '<p>y</p>'; EXCEPTION WHEN raise_exception THEN failed := true; END;
  ASSERT failed, 'task_reports must be immutable';

  FOR i IN 1..25 LOOP
    INSERT INTO task_photos (id, organization_id, task_id, uploaded_by, position, original_key, thumb_key, pdf_key, expires_at)
      VALUES (gen_random_uuid(), '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1',
              '00000000-0000-0000-0000-0000000000d2', i, 'o', 't', 'p', now() + interval '180 days');
  END LOOP;
  failed := false;
  BEGIN
    INSERT INTO task_photos (id, organization_id, task_id, uploaded_by, position, original_key, thumb_key, pdf_key, expires_at)
      VALUES (gen_random_uuid(), '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1',
              '00000000-0000-0000-0000-0000000000d2', 26, 'o', 't', 'p', now() + interval '180 days');
  EXCEPTION WHEN raise_exception THEN failed := true; END;
  ASSERT failed, 'the 26th photo must be rejected';
END $$;

ROLLBACK;
\echo 'rls tests passed'
