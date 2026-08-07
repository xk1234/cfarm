-- Preserve every existing record while replacing the legacy automation
-- persistence names with the canonical template names used by the product.
-- The insert/delete form is safe if a previous deploy already wrote a row to
-- the destination name before this migration ran.

INSERT INTO domain_records (
  table_name, row_id, owner_id, source_key, rid, name, status, ord,
  payload, source_row, permissions, appwrite_created_at,
  appwrite_updated_at, migrated_at
)
SELECT
  CASE table_name
    WHEN 'automations' THEN 'templates'
    WHEN 'automation_runs' THEN 'template_runs'
    WHEN 'x_automations' THEN 'social_templates'
  END,
  row_id, owner_id, source_key, rid, name, status, ord,
  payload, source_row, permissions, appwrite_created_at,
  appwrite_updated_at, now()
FROM domain_records
WHERE table_name IN ('automations', 'automation_runs', 'x_automations')
ON CONFLICT (table_name, row_id) DO NOTHING;

DELETE FROM domain_records
WHERE table_name IN ('automations', 'automation_runs', 'x_automations');

UPDATE domain_records
SET source_key = CASE source_key
  WHEN 'x_automation_run' THEN 'social_template_run'
  WHEN 'automation_template' THEN 'starter_template'
  WHEN 'automation_template_example' THEN 'starter_template_example'
END,
source_row = jsonb_set(
  source_row,
  '{source_key}',
  to_jsonb(CASE source_key
    WHEN 'x_automation_run' THEN 'social_template_run'
    WHEN 'automation_template' THEN 'starter_template'
    WHEN 'automation_template_example' THEN 'starter_template_example'
  END),
  true
),
migrated_at = now()
WHERE source_key IN (
  'x_automation_run',
  'automation_template',
  'automation_template_example'
);

UPDATE jobs
SET job_type = CASE job_type
  WHEN 'run-automation' THEN 'run-template'
  WHEN 'run-ugc-automation' THEN 'run-ugc-template'
  WHEN 'run-x-automation' THEN 'run-social-template'
END,
updated_at = now()
WHERE job_type IN (
  'run-automation',
  'run-ugc-automation',
  'run-x-automation'
);
