ALTER TABLE domain_records
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE domain_records
SET created_at = COALESCE(appwrite_created_at, migrated_at, now()),
    updated_at = COALESCE(appwrite_updated_at, appwrite_created_at, migrated_at, now());

ALTER TABLE domain_records
  DROP COLUMN appwrite_created_at,
  DROP COLUMN appwrite_updated_at;

ALTER TABLE object_manifest
  DROP COLUMN IF EXISTS appwrite_created_at,
  DROP COLUMN IF EXISTS appwrite_updated_at;

ALTER TABLE app_users
  DROP COLUMN IF EXISTS appwrite_created_at,
  DROP COLUMN IF EXISTS appwrite_updated_at;
