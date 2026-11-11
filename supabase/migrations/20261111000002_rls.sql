-- Row level security (section 6.4).
-- The API connects as the table owner and, inside each transaction, runs:
--   SET LOCAL ROLE api_rls;
--   SELECT set_config('app.user_id', ..., true), set_config('app.org_id', ..., true), set_config('app.role', ..., true);
-- Workers and migrations keep the owner role and bypass RLS on purpose.
-- anon/authenticated get no access: clients never talk to PostgREST, only to the API.

CREATE ROLE api_rls NOLOGIN;
GRANT api_rls TO postgres;

CREATE SCHEMA app;
GRANT USAGE ON SCHEMA app, public TO api_rls;

CREATE FUNCTION app.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
CREATE FUNCTION app.org() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
CREATE FUNCTION app.role() RETURNS text LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('app.role', true), '') $$;
CREATE FUNCTION app.is_admin() RETURNS boolean LANGUAGE sql STABLE
AS $$ SELECT app.role() = 'admin' $$;

-- SECURITY DEFINER lookups avoid recursive policy evaluation on admin-only tables.
CREATE FUNCTION app.my_company() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT client_company_id FROM users WHERE id = app.uid() $$;

-- Collaborator may see a task if actively assigned, or if inactive but the task is already finished.
CREATE FUNCTION app.collaborator_has_task(p_task uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM task_assignments a JOIN tasks t ON t.id = a.task_id
    WHERE a.task_id = p_task AND a.collaborator_id = app.uid()
      AND (a.active OR t.status NOT IN ('scheduled','on_site'))
  )
$$;

CREATE FUNCTION app.can_see_task(p_task uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE app.role()
    WHEN 'admin' THEN EXISTS (SELECT 1 FROM tasks WHERE id = p_task AND organization_id = app.org())
    WHEN 'collaborator' THEN app.collaborator_has_task(p_task)
    WHEN 'client_user' THEN EXISTS (
      SELECT 1 FROM tasks WHERE id = p_task AND organization_id = app.org()
        AND (client_user_id = app.uid() OR client_company_id = app.my_company()))
    ELSE false
  END
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO api_rls;

-- Lock out the Supabase client roles, then give the API role table access (RLS narrows it).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO api_rls;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO api_rls;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['organizations','client_companies','users','user_identifiers','service_types','tasks',
    'task_assignments','task_reports','task_report_drafts','task_photos','documents','objections',
    'objection_attachments','task_ratings','notifications_outbox','audit_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  -- Tenant isolation, ANDed with every permissive policy below.
  FOREACH t IN ARRAY ARRAY['client_companies','users','service_types','tasks','task_assignments','task_reports',
    'task_report_drafts','task_photos','documents','objections','objection_attachments','task_ratings',
    'notifications_outbox','audit_log']
  LOOP
    EXECUTE format('CREATE POLICY org_isolation ON %I AS RESTRICTIVE FOR ALL TO api_rls
      USING (organization_id = app.org()) WITH CHECK (organization_id = app.org())', t);
  END LOOP;
END $$;

CREATE POLICY org_isolation ON organizations AS RESTRICTIVE FOR ALL TO api_rls USING (id = app.org()) WITH CHECK (id = app.org());
CREATE POLICY org_select ON organizations FOR SELECT TO api_rls USING (true);
CREATE POLICY org_admin_write ON organizations FOR UPDATE TO api_rls USING (app.is_admin());

-- Admin-only tables
CREATE POLICY admin_all ON user_identifiers FOR ALL TO api_rls USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY admin_all ON task_assignments FOR ALL TO api_rls USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY admin_select ON notifications_outbox FOR SELECT TO api_rls USING (app.is_admin());
CREATE POLICY admin_select ON audit_log FOR SELECT TO api_rls USING (app.is_admin());
CREATE POLICY any_insert ON audit_log FOR INSERT TO api_rls WITH CHECK (true);

-- Catalogs
CREATE POLICY read ON service_types FOR SELECT TO api_rls USING (true);
CREATE POLICY admin_write ON service_types FOR ALL TO api_rls USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY read ON client_companies FOR SELECT TO api_rls
  USING (app.role() IN ('admin','collaborator') OR id = app.my_company());
CREATE POLICY admin_write ON client_companies FOR ALL TO api_rls USING (app.is_admin()) WITH CHECK (app.is_admin());

-- Users: names are visible inside the organization; only admins manage accounts, anyone edits their own profile.
CREATE POLICY read ON users FOR SELECT TO api_rls USING (true);
CREATE POLICY admin_write ON users FOR ALL TO api_rls USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY self_update ON users FOR UPDATE TO api_rls USING (id = app.uid()) WITH CHECK (id = app.uid());

-- Tasks. Non-admins must read through tasks_public (no cost column).
CREATE POLICY read ON tasks FOR SELECT TO api_rls USING (app.can_see_task(id));
CREATE POLICY admin_write ON tasks FOR ALL TO api_rls USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY collaborator_update ON tasks FOR UPDATE TO api_rls
  USING (app.role() = 'collaborator' AND app.collaborator_has_task(id))
  WITH CHECK (app.role() = 'collaborator' AND app.collaborator_has_task(id));

CREATE VIEW tasks_public WITH (security_invoker = true) AS
  SELECT id, organization_id, client_company_id, client_user_id, address, recipient_name, scheduled_start_at,
         assigned_hours, description, instructions, service_type_id, status, completed_at, received_at,
         objection_deadline_at, cancellation_reason, created_by, created_at, updated_at
  FROM tasks;
REVOKE ALL ON tasks_public FROM anon, authenticated;
GRANT SELECT ON tasks_public TO api_rls;

-- Task children follow task visibility; writes by the assigned collaborator or an admin.
CREATE POLICY read ON task_reports FOR SELECT TO api_rls USING (app.can_see_task(task_id));
CREATE POLICY write ON task_reports FOR INSERT TO api_rls
  WITH CHECK (app.is_admin() OR (app.role() = 'collaborator' AND completed_by = app.uid() AND app.collaborator_has_task(task_id)));

CREATE POLICY own ON task_report_drafts FOR ALL TO api_rls
  USING (collaborator_id = app.uid()) WITH CHECK (collaborator_id = app.uid() AND app.collaborator_has_task(task_id));

CREATE POLICY read ON task_photos FOR SELECT TO api_rls USING (app.can_see_task(task_id));
CREATE POLICY write ON task_photos FOR ALL TO api_rls
  USING (app.is_admin() OR (app.role() = 'collaborator' AND uploaded_by = app.uid()))
  WITH CHECK (app.is_admin() OR (app.role() = 'collaborator' AND uploaded_by = app.uid() AND app.collaborator_has_task(task_id)));

CREATE POLICY read ON documents FOR SELECT TO api_rls USING (app.can_see_task(task_id));
CREATE POLICY admin_write ON documents FOR ALL TO api_rls USING (app.is_admin()) WITH CHECK (app.is_admin());

-- Objections: admin full; the client user only reads and creates their own (RN-22: internal_notes via DTO only).
CREATE POLICY admin_all ON objections FOR ALL TO api_rls USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY client_read ON objections FOR SELECT TO api_rls
  USING (app.role() = 'client_user' AND author_id = app.uid() AND app.can_see_task(task_id));
CREATE POLICY client_insert ON objections FOR INSERT TO api_rls
  WITH CHECK (
    app.role() = 'client_user' AND author_id = app.uid() AND app.can_see_task(task_id)
    AND EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND t.status = 'completed' AND now() <= t.objection_deadline_at)
  );

CREATE POLICY admin_all ON objection_attachments FOR ALL TO api_rls USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY client_own ON objection_attachments FOR ALL TO api_rls
  USING (app.role() = 'client_user' AND uploaded_by = app.uid())
  WITH CHECK (app.role() = 'client_user' AND uploaded_by = app.uid() AND app.can_see_task(task_id));

-- Ratings: admin reads; the client user manages only their own.
CREATE POLICY admin_read ON task_ratings FOR SELECT TO api_rls USING (app.is_admin());
CREATE POLICY client_own ON task_ratings FOR ALL TO api_rls
  USING (app.role() = 'client_user' AND author_id = app.uid())
  WITH CHECK (app.role() = 'client_user' AND author_id = app.uid());
