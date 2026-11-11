-- What a collaborator may read and write on assignments, without ever touching the fee column (RN-13).
-- task_assignments stays admin-only under RLS; these SECURITY DEFINER functions expose just the safe parts.

CREATE FUNCTION app.task_team(p_task uuid)
RETURNS TABLE (assignment_id uuid, collaborator_id uuid, name text, arrived_at timestamptz, attendance_delayed boolean, active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.id, a.collaborator_id, u.name, a.arrived_at, a.attendance_delayed, a.active
  FROM task_assignments a JOIN users u ON u.id = a.collaborator_id
  WHERE a.task_id = p_task AND app.can_see_task(p_task)
  ORDER BY a.created_at, u.name, a.id
$$;

-- Registers the caller's own arrival. Idempotent: a second call keeps the first arrival.
-- Returns true when the caller has an active assignment on an open task of their organization.
CREATE FUNCTION app.register_arrival(p_task uuid, p_device_at timestamptz, p_delayed boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE found_row boolean;
BEGIN
  IF app.role() <> 'collaborator' THEN RETURN false; END IF;
  SELECT true INTO found_row FROM task_assignments a JOIN tasks t ON t.id = a.task_id
    WHERE a.task_id = p_task AND a.collaborator_id = app.uid() AND a.active
      AND t.organization_id = app.org() AND t.status IN ('scheduled','on_site');
  IF NOT COALESCE(found_row, false) THEN RETURN false; END IF;
  UPDATE task_assignments SET arrived_at = now(), device_arrived_at = p_device_at, attendance_delayed = p_delayed
    WHERE task_id = p_task AND collaborator_id = app.uid() AND active AND arrived_at IS NULL;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION app.task_team(uuid), app.register_arrival(uuid, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.task_team(uuid), app.register_arrival(uuid, timestamptz, boolean) TO api_rls;
