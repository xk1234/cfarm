CREATE OR REPLACE FUNCTION safe_bigint(value text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN value ~ '^-?[0-9]+$' THEN value::bigint
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION safe_numeric(value text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN value ~ '^-?[0-9]+([.][0-9]+)?$' THEN value::numeric
    ELSE NULL
  END
$$;

CREATE INDEX IF NOT EXISTS domain_records_table_row_created
  ON domain_records (table_name, ((source_row ->> '$createdAt')) DESC, row_id);
CREATE INDEX IF NOT EXISTS domain_records_table_owner_status
  ON domain_records (table_name, owner_id, status, row_id);
CREATE INDEX IF NOT EXISTS domain_records_output_media_output
  ON domain_records (table_name, ((source_row ->> 'output_id')), row_id)
  WHERE table_name = 'output_media';
CREATE INDEX IF NOT EXISTS domain_records_jobs_claim
  ON domain_records (
    status,
    ((source_row ->> 'available_at')),
    ((source_row ->> 'leased_until')),
    (safe_bigint(source_row ->> 'priority')) DESC,
    row_id
  )
  WHERE table_name = 'jobs';

CREATE TABLE IF NOT EXISTS domain_record_orphan_archive (
  table_name text NOT NULL,
  row_id text NOT NULL,
  reason text NOT NULL,
  source_record jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, row_id, reason)
);

INSERT INTO domain_record_orphan_archive (
  table_name,
  row_id,
  reason,
  source_record
)
SELECT
  media.table_name,
  media.row_id,
  'missing_parent_output',
  to_jsonb(media)
FROM domain_records AS media
WHERE media.table_name = 'output_media'
  AND NOT EXISTS (
    SELECT 1
    FROM domain_records AS output
    WHERE output.table_name = 'outputs'
      AND output.row_id = media.source_row ->> 'output_id'
  )
ON CONFLICT (table_name, row_id, reason) DO NOTHING;

DELETE FROM domain_records AS media
WHERE media.table_name = 'output_media'
  AND NOT EXISTS (
    SELECT 1
    FROM domain_records AS output
    WHERE output.table_name = 'outputs'
      AND output.row_id = media.source_row ->> 'output_id'
  );

CREATE OR REPLACE FUNCTION maintain_output_media_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.table_name = 'outputs' THEN
    DELETE FROM domain_records
    WHERE table_name = 'output_media'
      AND source_row ->> 'output_id' = OLD.row_id;
    RETURN OLD;
  END IF;

  IF NEW.table_name = 'output_media' AND NOT EXISTS (
    SELECT 1
    FROM domain_records
    WHERE table_name = 'outputs'
      AND row_id = NEW.source_row ->> 'output_id'
  ) THEN
    RAISE EXCEPTION 'output_media references missing output %',
      NEW.source_row ->> 'output_id'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS domain_records_output_media_insert_guard
  ON domain_records;
CREATE TRIGGER domain_records_output_media_insert_guard
BEFORE INSERT OR UPDATE OF source_row ON domain_records
FOR EACH ROW
WHEN (NEW.table_name = 'output_media')
EXECUTE FUNCTION maintain_output_media_reference();

DROP TRIGGER IF EXISTS domain_records_output_media_delete_cascade
  ON domain_records;
CREATE TRIGGER domain_records_output_media_delete_cascade
AFTER DELETE ON domain_records
FOR EACH ROW
WHEN (OLD.table_name = 'outputs')
EXECUTE FUNCTION maintain_output_media_reference();

CREATE TABLE IF NOT EXISTS request_rate_limits (
  scope text NOT NULL,
  subject text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, subject)
);

CREATE INDEX IF NOT EXISTS request_rate_limits_updated
  ON request_rate_limits (updated_at);

CREATE TABLE IF NOT EXISTS request_concurrency_leases (
  scope text NOT NULL,
  lease_id text PRIMARY KEY,
  subject text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS request_concurrency_leases_active
  ON request_concurrency_leases (scope, expires_at);

CREATE TABLE IF NOT EXISTS windmill_workflow_runs (
  job_id text PRIMARY KEY,
  owner_id text NOT NULL,
  workflow_id text NOT NULL,
  request_id text NOT NULL,
  flow_path text NOT NULL,
  template_id text,
  status text NOT NULL DEFAULT 'queued',
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS windmill_workflow_runs_owner_recent
  ON windmill_workflow_runs (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS windmill_workflow_runs_active
  ON windmill_workflow_runs (status, updated_at)
  WHERE status IN ('queued', 'running');
