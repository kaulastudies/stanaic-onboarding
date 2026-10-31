-- Additive platform extension. Never reads/writes demo onboarding or Neon auth tables.
CREATE TABLE IF NOT EXISTS stanaic_platform_workspaces (
  id text PRIMARY KEY,
  demo boolean NOT NULL DEFAULT false,
  state jsonb NOT NULL,
  expires_at bigint,
  created_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS stanaic_platform_sessions (
  token_hash text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES stanaic_platform_workspaces(id) ON DELETE CASCADE,
  role text NOT NULL,
  actor_id text NOT NULL,
  expires_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS stanaic_platform_roles (
  email text PRIMARY KEY,
  role text NOT NULL,
  user_id text,
  created_by text NOT NULL,
  created_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS stanaic_platform_credentials (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES stanaic_platform_workspaces(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  demo boolean NOT NULL,
  expires_at bigint
);
CREATE TABLE IF NOT EXISTS stanaic_platform_limits (
  key text PRIMARY KEY,
  count integer NOT NULL,
  expires_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS stanaic_platform_workspaces_expiry ON stanaic_platform_workspaces(expires_at);
CREATE INDEX IF NOT EXISTS stanaic_platform_sessions_expiry ON stanaic_platform_sessions(expires_at);
