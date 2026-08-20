ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE INDEX IF NOT EXISTS jobs_claim_order
  ON jobs (status, priority DESC, run_at, created_at)
  WHERE status IN ('queued', 'processing');

CREATE INDEX IF NOT EXISTS jobs_owner_status_recent
  ON jobs (owner_id, status, created_at DESC);
