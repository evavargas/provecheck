-- Core schema from docs/provecheck-documentacion-desarrollo.md section 6.
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;

CREATE TYPE user_role AS ENUM ('admin','collaborator','client_user');
CREATE TYPE user_status AS ENUM ('active','inactive','pending_first_login');
CREATE TYPE task_status AS ENUM ('scheduled','on_site','completed','objection_filed','in_review','resolved','cancelled');
CREATE TYPE photo_status AS ENUM ('uploading','uploaded','expired');
CREATE TYPE objection_status AS ENUM ('open','in_review','resolved');
CREATE TYPE outbox_channel AS ENUM ('email');
CREATE TYPE outbox_status AS ENUM ('pending','sent','failed','skipped_no_contact');

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_key text,
  timezone text NOT NULL DEFAULT 'America/Montevideo',
  default_locale text NOT NULL DEFAULT 'es-UY' CHECK (default_locale IN ('es-UY','en')),
  default_objection_window_hours int NOT NULL DEFAULT 336 CHECK (default_objection_window_hours BETWEEN 1 AND 8760),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE client_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  legal_name text NOT NULL,
  address text,
  phone text,
  email text,
  contacts jsonb NOT NULL DEFAULT '[]',
  notes text,
  objection_window_hours int CHECK (objection_window_hours BETWEEN 1 AND 8760),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, legal_name)
);

CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  role user_role NOT NULL,
  name text NOT NULL,
  username extensions.citext NOT NULL,
  email extensions.citext NOT NULL,
  phone text NOT NULL,
  status user_status NOT NULL DEFAULT 'pending_first_login',
  must_change_password boolean NOT NULL DEFAULT true,
  theme text NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system')),
  locale text CHECK (locale IN ('es-UY','en')),
  email_confirmed_at timestamptz,
  password_changed_at timestamptz,
  client_company_id uuid REFERENCES client_companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (username ~ '^[a-z0-9._-]{3,30}$'),
  CHECK (client_company_id IS NULL OR role = 'client_user')
);
CREATE INDEX users_org_role_idx ON users (organization_id, role, status);

-- Global uniqueness of username and email (RN-25): two rows per user, same transaction as users.
CREATE TABLE user_identifiers (
  identifier extensions.citext PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('username','email'))
);
CREATE UNIQUE INDEX one_identifier_kind_per_user ON user_identifiers (user_id, kind);

CREATE TABLE service_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id, name)
);

CREATE TABLE tasks (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  client_company_id uuid REFERENCES client_companies(id),
  client_user_id uuid REFERENCES users(id),
  address text NOT NULL,
  recipient_name text,
  scheduled_start_at timestamptz NOT NULL,
  assigned_hours numeric(5,2),
  description text NOT NULL,
  instructions text,
  service_type_id uuid REFERENCES service_types(id),
  cost_uyu numeric(12,2) CHECK (cost_uyu >= 0),
  status task_status NOT NULL DEFAULT 'scheduled',
  completed_at timestamptz,
  received_at timestamptz,
  objection_deadline_at timestamptz,
  cancellation_reason text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (client_company_id IS NOT NULL OR client_user_id IS NOT NULL)
);
CREATE INDEX tasks_org_status_idx ON tasks (organization_id, status, scheduled_start_at);
CREATE INDEX tasks_company_idx ON tasks (client_company_id, completed_at DESC);
CREATE INDEX tasks_client_user_idx ON tasks (client_user_id, completed_at DESC);

CREATE TABLE task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  task_id uuid NOT NULL REFERENCES tasks(id),
  collaborator_id uuid NOT NULL REFERENCES users(id),
  collaborator_fee_uyu numeric(12,2) CHECK (collaborator_fee_uyu >= 0),
  arrived_at timestamptz,
  device_arrived_at timestamptz,
  attendance_delayed boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  replaced_by uuid REFERENCES task_assignments(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_assignment ON task_assignments (task_id, collaborator_id) WHERE active;

CREATE TABLE task_reports (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  task_id uuid NOT NULL UNIQUE REFERENCES tasks(id),
  content_json jsonb NOT NULL,
  content_html text NOT NULL,
  completed_by uuid NOT NULL REFERENCES users(id),
  device_completed_at timestamptz NOT NULL,
  device_sent_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE task_report_drafts (
  task_id uuid NOT NULL REFERENCES tasks(id),
  collaborator_id uuid NOT NULL REFERENCES users(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  content_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, collaborator_id)
);

CREATE TABLE task_photos (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  task_id uuid NOT NULL REFERENCES tasks(id),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  position smallint NOT NULL,
  original_key text NOT NULL,
  thumb_key text NOT NULL,
  pdf_key text NOT NULL,
  bytes int,
  sha256 text,
  status photo_status NOT NULL DEFAULT 'uploading',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX photos_task_idx ON task_photos (task_id, position);
CREATE INDEX photos_expires_idx ON task_photos (expires_at) WHERE status <> 'expired';

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  task_id uuid NOT NULL REFERENCES tasks(id),
  pdf_key text NOT NULL,
  hash text NOT NULL,
  version int NOT NULL DEFAULT 1,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE objections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  task_id uuid NOT NULL UNIQUE REFERENCES tasks(id),
  author_id uuid NOT NULL REFERENCES users(id),
  description text NOT NULL CHECK (length(description) BETWEEN 5 AND 4000),
  status objection_status NOT NULL DEFAULT 'open',
  internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE objection_attachments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  task_id uuid NOT NULL REFERENCES tasks(id),
  staging_id uuid NOT NULL,
  objection_id uuid REFERENCES objections(id),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  position smallint NOT NULL,
  original_key text NOT NULL,
  thumb_key text NOT NULL,
  bytes int,
  sha256 text,
  status photo_status NOT NULL DEFAULT 'uploading',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX objection_att_idx ON objection_attachments (objection_id, position);
CREATE INDEX objection_att_staging_idx ON objection_attachments (staging_id);

CREATE TABLE task_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  task_assignment_id uuid NOT NULL REFERENCES task_assignments(id),
  author_id uuid NOT NULL REFERENCES users(id),
  stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text CHECK (length(comment) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  UNIQUE (task_assignment_id, author_id)
);

CREATE TABLE notifications_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  task_id uuid REFERENCES tasks(id),
  channel outbox_channel NOT NULL,
  recipient text,
  type text NOT NULL,
  status outbox_status NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL,
  actor_id uuid,
  entity text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON audit_log (organization_id, entity, entity_id, created_at DESC);

-- Business rules in the database (section 6.3)
CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER tasks_touch_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER objections_touch_updated_at BEFORE UPDATE ON objections FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE FUNCTION reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'task_reports are immutable'; END $$;
CREATE TRIGGER task_reports_immutable BEFORE UPDATE OR DELETE ON task_reports FOR EACH ROW EXECUTE FUNCTION reject_change();

CREATE FUNCTION enforce_photo_cap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM task_photos WHERE task_id = NEW.task_id AND status <> 'expired') >= 25 THEN
    RAISE EXCEPTION 'photo limit reached (25 per task)';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER task_photos_cap BEFORE INSERT ON task_photos FOR EACH ROW EXECUTE FUNCTION enforce_photo_cap();

CREATE FUNCTION enforce_attachment_cap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM objection_attachments WHERE staging_id = NEW.staging_id) >= 5 THEN
    RAISE EXCEPTION 'attachment limit reached (5 per objection)';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER objection_attachments_cap BEFORE INSERT ON objection_attachments FOR EACH ROW EXECUTE FUNCTION enforce_attachment_cap();
