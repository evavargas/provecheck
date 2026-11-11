-- Background jobs in Postgres: workers claim rows with FOR UPDATE SKIP LOCKED, so no Redis and no extra service.
-- Only the API (owner role) reads and runs them; clients never touch this table. The api_rls role can enqueue,
-- so a finalize can create its PDF job inside the same transaction as the record.
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  run_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX jobs_claim_idx ON jobs (run_at) WHERE status IN ('pending','running');

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON jobs FROM anon, authenticated;
GRANT INSERT ON jobs TO api_rls;
CREATE POLICY enqueue ON jobs FOR INSERT TO api_rls WITH CHECK (organization_id = app.org());

-- Photos: the 180 day retention starts when the row is created (RN-16); the job below deletes the objects.
