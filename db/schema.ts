import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, uniqueIndex, index, check } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull(),
});
export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => accounts.id),
  name: text("name").notNull(),
  website: text("website"),
  createdAt: text("created_at").notNull(),
}, t => [uniqueIndex("workspaces_owner_unique").on(t.ownerId)]);
export const programs = sqliteTable("programs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  rateBps: integer("rate_bps").notNull(),
  windowDays: integer("window_days").notNull(),
  active: integer("active").notNull(),
  createdAt: text("created_at").notNull(),
}, t => [uniqueIndex("programs_workspace_unique").on(t.workspaceId),check("program_rate_range",sql`${t.rateBps} BETWEEN 100 AND 5000`),check("program_window_range",sql`${t.windowDays} BETWEEN 1 AND 90`),check("program_active_boolean",sql`${t.active} IN (0,1)`)]);
export const affiliateProfiles = sqliteTable("affiliate_profiles", {
  userId: text("user_id").primaryKey().references(() => accounts.id),
  displayName: text("display_name").notNull(),
  channel: text("channel").notNull(),
  website: text("website"),
  bio: text("bio").notNull(),
  createdAt: text("created_at").notNull(),
});
export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(),
  programId: text("program_id").notNull().references(() => programs.id),
  affiliateUserId: text("affiliate_user_id").notNull().references(() => accounts.id),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, t => [uniqueIndex("applications_program_user_unique").on(t.programId,t.affiliateUserId),index("applications_user_index").on(t.affiliateUserId),check("application_status_valid",sql`${t.status} IN ('pending','approved','suspended','rejected')`)]);
export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  actorId: text("actor_id").notNull().references(() => accounts.id),
  action: text("action").notNull(),
  createdAt: text("created_at").notNull(),
}, t => [index("audit_workspace_index").on(t.workspaceId,t.createdAt)]);
