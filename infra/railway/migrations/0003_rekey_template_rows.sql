-- Re-key the canonical template tables with their final table namespaces.
-- Domain ids (`rid` and payload ids) stay unchanged: stored relationships use
-- those domain ids, not the physical TablesDB-compatible row id.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TEMP TABLE template_row_rekeys (
  table_name text NOT NULL,
  old_row_id text NOT NULL,
  new_row_id text NOT NULL,
  PRIMARY KEY (table_name, old_row_id),
  UNIQUE (table_name, new_row_id)
) ON COMMIT DROP;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM domain_records
    WHERE table_name IN ('templates', 'template_runs', 'social_templates')
      AND coalesce(rid, '') = ''
  ) THEN
    RAISE EXCEPTION 'Canonical template rows must have a domain rid before re-keying.';
  END IF;
END
$$;

INSERT INTO template_row_rekeys (table_name, old_row_id, new_row_id)
SELECT
  table_name,
  row_id,
  CASE
    WHEN coalesce(owner_id, '') <> '' THEN
      'u' || substr(
        encode(
          digest(table_name || ':' || owner_id || ':' || rid, 'sha256'),
          'hex'
        ),
        1,
        35
      )
    WHEN coalesce(rid, '') ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$' THEN rid
    ELSE
      'r' || substr(
        encode(
          digest(table_name || ':' || rid, 'sha256'),
          'hex'
        ),
        1,
        35
      )
  END
FROM domain_records
WHERE table_name IN ('templates', 'template_runs', 'social_templates');

UPDATE domain_records AS record
SET
  row_id = rekey.new_row_id,
  source_row = jsonb_set(
    record.source_row,
    '{$id}',
    to_jsonb(rekey.new_row_id),
    true
  ),
  migrated_at = now()
FROM template_row_rekeys AS rekey
WHERE record.table_name = rekey.table_name
  AND record.row_id = rekey.old_row_id
  AND record.row_id <> rekey.new_row_id;
