-- Filing an objection touches several tables the client user cannot write (tasks, objections link, audit).
-- One SECURITY DEFINER function does it atomically and enforces every rule in the database (RN-7, RN-1, RN-6).
-- Business errors are raised as plain messages that the API maps to stable codes.
CREATE FUNCTION app.file_objection(p_task uuid, p_staging uuid, p_description text, p_attachments uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t tasks%ROWTYPE;
  oid uuid;
  n int;
  wanted int := COALESCE(array_length(p_attachments, 1), 0);
BEGIN
  IF app.role() <> 'client_user' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO t FROM tasks WHERE id = p_task AND organization_id = app.org() FOR UPDATE;
  IF NOT FOUND OR NOT app.can_see_task(p_task) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM objections WHERE task_id = p_task) THEN RAISE EXCEPTION 'OBJECTION_ALREADY_EXISTS'; END IF;
  IF t.status <> 'completed' THEN RAISE EXCEPTION 'INVALID_STATE_TRANSITION'; END IF;
  IF now() > t.objection_deadline_at THEN RAISE EXCEPTION 'OBJECTION_WINDOW_CLOSED'; END IF;
  IF length(trim(p_description)) NOT BETWEEN 5 AND 4000 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  IF wanted > 5 THEN RAISE EXCEPTION 'ATTACHMENT_LIMIT_EXCEEDED'; END IF;

  SELECT count(*) INTO n FROM objection_attachments
    WHERE id = ANY(p_attachments) AND task_id = p_task AND staging_id = p_staging AND uploaded_by = app.uid()
      AND status = 'uploaded' AND objection_id IS NULL;
  IF n <> wanted THEN RAISE EXCEPTION 'PHOTOS_NOT_CONFIRMED'; END IF;

  INSERT INTO objections (organization_id, task_id, author_id, description)
    VALUES (t.organization_id, p_task, app.uid(), trim(p_description)) RETURNING id INTO oid;
  UPDATE objection_attachments a SET objection_id = oid, position = o.pos - 1
    FROM unnest(p_attachments) WITH ORDINALITY AS o(aid, pos) WHERE a.id = o.aid;
  UPDATE tasks SET status = 'objection_filed', updated_at = now() WHERE id = p_task;
  INSERT INTO audit_log (organization_id, actor_id, entity, entity_id, action, before, after)
    VALUES (t.organization_id, app.uid(), 'task', p_task::text, 'objection_filed',
            '{"status":"completed"}', jsonb_build_object('status', 'objection_filed', 'objectionId', oid));
  RETURN oid;
END $$;

REVOKE ALL ON FUNCTION app.file_objection(uuid, uuid, text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.file_objection(uuid, uuid, text, uuid[]) TO api_rls;
