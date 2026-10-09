CREATE TABLE IF NOT EXISTS output_media (
  id text PRIMARY KEY,
  output_id text NOT NULL,
  owner_id text NOT NULL,
  kind text NOT NULL,
  role text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  storage_bucket text,
  storage_file_id text,
  storage_path text,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS output_media_output_position
  ON output_media (output_id, position);
CREATE INDEX IF NOT EXISTS output_media_owner
  ON output_media (owner_id);

INSERT INTO output_media (
  id, output_id, owner_id, kind, role, position,
  storage_bucket, storage_file_id, storage_path, url, created_at
)
SELECT
  row_id,
  COALESCE(payload->>'output_id', source_row->>'output_id', '') AS output_id,
  COALESCE(payload->>'owner_id', source_row->>'owner_id', '') AS owner_id,
  COALESCE(NULLIF(payload->>'kind', ''), 'file') AS kind,
  COALESCE(NULLIF(payload->>'role', ''), 'file') AS role,
  COALESCE((payload->>'position')::integer, 0) AS position,
  NULLIF(payload->>'storage_bucket', ''),
  NULLIF(payload->>'storage_file_id', ''),
  NULLIF(payload->>'storage_path', ''),
  COALESCE(payload->>'url', '') AS url,
  LEAST(
    COALESCE(appwrite_created_at, migrated_at, now()),
    now()
  ) AS created_at
FROM domain_records
WHERE table_name = 'output_media'
ON CONFLICT (id) DO UPDATE SET
  output_id = EXCLUDED.output_id,
  owner_id = EXCLUDED.owner_id,
  kind = EXCLUDED.kind,
  role = EXCLUDED.role,
  position = EXCLUDED.position,
  storage_bucket = EXCLUDED.storage_bucket,
  storage_file_id = EXCLUDED.storage_file_id,
  storage_path = EXCLUDED.storage_path,
  url = EXCLUDED.url;
