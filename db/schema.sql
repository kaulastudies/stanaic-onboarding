CREATE TABLE IF NOT EXISTS "audit" (
	"id" text PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"created_at" bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"request_key" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"designation" text NOT NULL,
	"status" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_expires" bigint NOT NULL,
	"token_used" bigint,
	"profile" text,
	"feedback" text,
	"created_by" text NOT NULL,
	"created_at" bigint NOT NULL,
	"submitted_at" bigint,
	"reviewed_at" bigint
);

CREATE UNIQUE INDEX IF NOT EXISTS "invitations_request_key_unique" ON "invitations" ("request_key");
CREATE UNIQUE INDEX IF NOT EXISTS "invitations_token_hash_unique" ON "invitations" ("token_hash");
CREATE TABLE IF NOT EXISTS "limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" bigint NOT NULL,
	"expires_at" bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS "outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"recipient" text NOT NULL,
	"kind" text NOT NULL,
	"invitation_id" text NOT NULL,
	"payload" text NOT NULL,
	"status" text NOT NULL,
	"attempts" bigint DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"attempted_at" bigint,
	"provider_id" text,
	"error" text,
	FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS "sessions" (
	"hash" text PRIMARY KEY NOT NULL,
	"invitation_id" text NOT NULL,
	"expires_at" bigint NOT NULL,
	FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS "staff" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"user_id" text,
	"role" text NOT NULL,
	"created_at" bigint NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_email_unique" ON "staff" ("email");
CREATE UNIQUE INDEX IF NOT EXISTS "staff_user_id_unique" ON "staff" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_invitation_per_email" ON "invitations" ("email") WHERE "invitations"."status" NOT IN ('revoked','declined');
