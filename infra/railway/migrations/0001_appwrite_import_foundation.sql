CREATE TABLE IF NOT EXISTS app_users (
  id text PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  email_verified boolean NOT NULL DEFAULT false,
  password_hash text,
  requires_password_reset boolean NOT NULL DEFAULT true,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  appwrite_created_at timestamptz,
  appwrite_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_unique
  ON app_users (lower(email));

CREATE TABLE IF NOT EXISTS auth_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  secret_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_active
  ON auth_sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS domain_records (
  table_name text NOT NULL,
  row_id text NOT NULL,
  owner_id text,
  source_key text,
  rid text,
  name text,
  status text,
  ord bigint,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_row jsonb NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  appwrite_created_at timestamptz,
  appwrite_updated_at timestamptz,
  migrated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, row_id)
);

CREATE INDEX IF NOT EXISTS domain_records_owner
  ON domain_records (owner_id);
CREATE INDEX IF NOT EXISTS domain_records_source
  ON domain_records (table_name, source_key);
CREATE INDEX IF NOT EXISTS domain_records_owner_source_ord
  ON domain_records (table_name, owner_id, source_key, ord);
CREATE INDEX IF NOT EXISTS domain_records_rid
  ON domain_records (table_name, rid);
CREATE INDEX IF NOT EXISTS domain_records_payload_gin
  ON domain_records USING gin (payload jsonb_path_ops);

CREATE TABLE IF NOT EXISTS object_manifest (
  source_bucket_id text NOT NULL,
  source_file_id text NOT NULL,
  object_key text NOT NULL UNIQUE,
  name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  checksum text,
  appwrite_created_at timestamptz,
  appwrite_updated_at timestamptz,
  migrated_at timestamptz,
  verified_at timestamptz,
  source_file jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (source_bucket_id, source_file_id)
);

CREATE INDEX IF NOT EXISTS object_manifest_migration_state
  ON object_manifest (migrated_at, verified_at);

CREATE TABLE IF NOT EXISTS migration_runs (
  id text PRIMARY KEY,
  migration_kind text NOT NULL,
  source_project_id text NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  source_count bigint NOT NULL DEFAULT 0,
  migrated_count bigint NOT NULL DEFAULT 0,
  skipped_count bigint NOT NULL DEFAULT 0,
  failed_count bigint NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS migration_runs_recent
  ON migration_runs (migration_kind, started_at DESC);

CREATE TABLE IF NOT EXISTS migration_checkpoints (
  migration_kind text NOT NULL,
  source_scope text NOT NULL,
  last_source_id text,
  source_count bigint NOT NULL DEFAULT 0,
  migrated_count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (migration_kind, source_scope)
);

CREATE TABLE IF NOT EXISTS migration_failures (
  id bigserial PRIMARY KEY,
  migration_run_id text NOT NULL REFERENCES migration_runs(id) ON DELETE CASCADE,
  source_scope text NOT NULL,
  source_id text,
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS migration_failures_run
  ON migration_failures (migration_run_id, source_scope);

CREATE TABLE IF NOT EXISTS jobs (
  id text PRIMARY KEY,
  owner_id text,
  job_type text NOT NULL,
  status text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  run_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS jobs_claimable
  ON jobs (status, run_at, lease_expires_at);
CREATE INDEX IF NOT EXISTS jobs_owner_recent
  ON jobs (owner_id, created_at DESC);
