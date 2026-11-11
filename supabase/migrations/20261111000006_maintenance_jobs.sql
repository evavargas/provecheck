-- Maintenance jobs belong to no organization (they sweep every tenant), and each runs once per day:
-- the unique index makes "enqueue today's run" safe even if two API instances try at once.
ALTER TABLE jobs ALTER COLUMN organization_id DROP NOT NULL;
CREATE UNIQUE INDEX jobs_daily_idx ON jobs (type, (payload ->> 'day')) WHERE organization_id IS NULL;
