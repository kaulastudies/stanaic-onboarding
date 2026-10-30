import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const staff = sqliteTable("staff", {
  id: text("id").primaryKey(), email: text("email").notNull().unique(), userId: text("user_id").unique(),
  role: text("role").notNull(), createdAt: integer("created_at").notNull(),
});
export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey(), requestKey: text("request_key").notNull().unique(),
  name: text("name").notNull(), email: text("email").notNull(), designation: text("designation").notNull(), status: text("status").notNull(),
  tokenHash: text("token_hash").notNull().unique(), tokenExpires: integer("token_expires").notNull(), tokenUsed: integer("token_used"),
  profile: text("profile"), feedback: text("feedback"), createdBy: text("created_by").notNull(), createdAt: integer("created_at").notNull(),
  submittedAt: integer("submitted_at"), reviewedAt: integer("reviewed_at"),
}, table => [uniqueIndex("one_active_invitation_per_email").on(table.email).where(sql`${table.status} NOT IN ('revoked','declined')`)]);
export const sessions = sqliteTable("sessions", {
  hash: text("hash").primaryKey(), invitationId: text("invitation_id").notNull().references(() => invitations.id), expiresAt: integer("expires_at").notNull(),
});
export const outbox = sqliteTable("outbox", {
  id: text("id").primaryKey(), recipient: text("recipient").notNull(), kind: text("kind").notNull(),
  invitationId: text("invitation_id").notNull().references(() => invitations.id), payload: text("payload").notNull(), status: text("status").notNull(),
  attempts: integer("attempts").notNull().default(0), createdAt: integer("created_at").notNull(), attemptedAt: integer("attempted_at"), providerId: text("provider_id"), error: text("error"),
});
export const audit = sqliteTable("audit", { id: text("id").primaryKey(), actor: text("actor").notNull(), action: text("action").notNull(), target: text("target").notNull(), createdAt: integer("created_at").notNull() });
export const limits = sqliteTable("limits", { key: text("key").primaryKey(), count: integer("count").notNull(), expiresAt: integer("expires_at").notNull() });
