DROP TABLE IF EXISTS auth_sessions;

ALTER TABLE app_users
  DROP COLUMN IF EXISTS password_hash,
  DROP COLUMN IF EXISTS requires_password_reset;
