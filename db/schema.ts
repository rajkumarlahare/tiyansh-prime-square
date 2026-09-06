import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
export const projects = sqliteTable("projects", {
  id:text("id").primaryKey(), name:text("name").notNull(), slug:text("slug").notNull().unique(),
  publicHost:text("public_host"), adminHost:text("admin_host"), status:text("status").notNull().default("active"),
  createdAt:text("created_at").notNull(), updatedAt:text("updated_at").notNull()
},table=>({publicHostUnique:uniqueIndex("projects_public_host_unique").on(table.publicHost),adminHostUnique:uniqueIndex("projects_admin_host_unique").on(table.adminHost)}));
export const plots = sqliteTable("plots", { projectId:text("project_id").notNull().default("tiyansh-prime-square").references(()=>projects.id), id:text("id").notNull(), sqft:real("sqft").notNull(), sqm:real("sqm").notNull(), sqyd:real("sqyd").notNull(), dimensions:text("dimensions").notNull(), road:text("road").notNull(), polygon:text("polygon").notNull().default(""), status:text("status").notNull().default("available"), notes:text("notes").notNull().default(""), featured:integer("featured",{mode:"boolean"}).notNull().default(false), updatedAt:text("updated_at").notNull() },table=>({pk:primaryKey({columns:[table.projectId,table.id]})}));
export const settings = sqliteTable("settings", { projectId:text("project_id").notNull().default("tiyansh-prime-square").references(()=>projects.id), key:text("key").notNull(), value:text("value").notNull(), updatedAt:text("updated_at").notNull() },table=>({pk:primaryKey({columns:[table.projectId,table.key]})}));
export const gallery = sqliteTable("gallery", { projectId:text("project_id").notNull().default("tiyansh-prime-square").references(()=>projects.id), id:text("id").notNull(), objectKey:text("object_key").notNull().unique(), filename:text("filename").notNull(), contentType:text("content_type").notNull(), caption:text("caption").notNull().default(""), sortOrder:integer("sort_order").notNull().default(0), createdAt:text("created_at").notNull() },table=>({pk:primaryKey({columns:[table.projectId,table.id]})}));
export const loginAttempts = sqliteTable("login_attempts", { key:text("key").primaryKey(), attempts:integer("attempts").notNull().default(0), windowStart:integer("window_start").notNull() });
export const adminUsers = sqliteTable("admin_users", {
  id:text("id").primaryKey(), email:text("email").notNull().unique(), name:text("name").notNull(),
  projectId:text("project_id").notNull().references(()=>projects.id),
  role:text("role").notNull().default("client_admin"), passwordHash:text("password_hash").notNull(),
  passwordSalt:text("password_salt").notNull(), status:text("status").notNull().default("active"),
  mustChangePassword:integer("must_change_password",{mode:"boolean"}).notNull().default(true),
  sessionVersion:integer("session_version").notNull().default(1), passwordChangedAt:text("password_changed_at"),
  createdAt:text("created_at").notNull(), updatedAt:text("updated_at").notNull(), lastLoginAt:text("last_login_at")
});
export const auditLogs = sqliteTable("audit_logs", {
  id:text("id").primaryKey(), actorId:text("actor_id").notNull(), actorEmail:text("actor_email").notNull(),
  action:text("action").notNull(), projectId:text("project_id"), targetId:text("target_id"), details:text("details").notNull().default("{}"), createdAt:text("created_at").notNull()
},table=>({projectCreatedIndex:index("idx_audit_logs_project_created").on(table.projectId,table.createdAt)}));
