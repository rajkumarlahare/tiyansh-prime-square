import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id:text("id").primaryKey(), name:text("name").notNull(), slug:text("slug").notNull().unique(),
  publicHost:text("public_host"), adminHost:text("admin_host"), status:text("status").notNull().default("active"),
  publicStatus:text("public_status").notNull().default("draft"), publishedAt:text("published_at"),
  publishVersion:integer("publish_version").notNull().default(0),
  createdAt:text("created_at").notNull(), updatedAt:text("updated_at").notNull()
},table=>({publicHostUnique:uniqueIndex("projects_public_host_unique").on(table.publicHost),adminHostUnique:uniqueIndex("projects_admin_host_unique").on(table.adminHost)}));

export const projectDomains = sqliteTable("project_domains", {
  host:text("host").primaryKey(),
  projectId:text("project_id").notNull().references(()=>projects.id),
  kind:text("kind").notNull(),
  publicPrimary:integer("public_primary",{mode:"boolean"}).notNull().default(false),
  adminPrimary:integer("admin_primary",{mode:"boolean"}).notNull().default(false),
  status:text("status").notNull().default("active"),
  createdAt:text("created_at").notNull(),
  updatedAt:text("updated_at").notNull()
},table=>({projectKindIndex:index("idx_project_domains_project_kind").on(table.projectId,table.kind,table.status)}));

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

// Mirrors the already-applied additive migration 0009_rekixo_geo_mapper.sql.
// No core project/plot table is altered by these declarations.
export const geoProjectSettings = sqliteTable("geo_project_settings", {
  projectId:text("project_id").primaryKey(),
  draftRevision:integer("draft_revision").notNull().default(0),
  publishedRevision:integer("published_revision").notNull().default(0),
  publicEnabled:integer("public_enabled",{mode:"boolean"}).notNull().default(false),
  publishedAt:text("published_at"),
  updatedAt:text("updated_at").notNull()
});
export const geoControlPoints = sqliteTable("geo_control_points", {
  projectId:text("project_id").notNull(), id:text("id").notNull(),
  sourceX:real("source_x").notNull(), sourceY:real("source_y").notNull(),
  longitude:real("longitude").notNull(), latitude:real("latitude").notNull(),
  label:text("label").notNull().default(""), sortOrder:integer("sort_order").notNull().default(0),
  updatedAt:text("updated_at").notNull()
},table=>({pk:primaryKey({columns:[table.projectId,table.id]}),projectSortIndex:index("idx_geo_control_points_project_sort").on(table.projectId,table.sortOrder)}));
export const geoFeatures = sqliteTable("geo_features", {
  projectId:text("project_id").notNull(), id:text("id").notNull(), name:text("name").notNull().default(""),
  layer:text("layer").notNull().default("default"), geometryType:text("geometry_type").notNull(), geometry:text("geometry").notNull(),
  linkedPlotId:text("linked_plot_id"), source:text("source").notNull().default("manual"), properties:text("properties").notNull().default("{}"),
  updatedAt:text("updated_at").notNull()
},table=>({pk:primaryKey({columns:[table.projectId,table.id]}),projectLayerIndex:index("idx_geo_features_project_layer").on(table.projectId,table.layer,table.name),projectPlotIndex:index("idx_geo_features_project_plot").on(table.projectId,table.linkedPlotId)}));
export const geoSources = sqliteTable("geo_sources", {
  projectId:text("project_id").notNull(), id:text("id").notNull(), filename:text("filename").notNull(), contentType:text("content_type").notNull(),
  sizeBytes:integer("size_bytes").notNull(), sha256:text("sha256").notNull(), objectKey:text("object_key").notNull(), createdAt:text("created_at").notNull()
},table=>({pk:primaryKey({columns:[table.projectId,table.id]}),projectCreatedIndex:index("idx_geo_sources_project_created").on(table.projectId,table.createdAt)}));
export const geoVersions = sqliteTable("geo_versions", {
  projectId:text("project_id").notNull(), version:integer("version").notNull(), snapshot:text("snapshot").notNull(), createdAt:text("created_at").notNull()
},table=>({pk:primaryKey({columns:[table.projectId,table.version]}),projectCreatedIndex:index("idx_geo_versions_project_created").on(table.projectId,table.createdAt)}));


// Global platform configuration, isolated from per-project settings.
// The Google Maps browser key is intentionally platform-scoped because one restricted
// browser key powers Super Admin Geo Labs across current and future client projects.
export const platformSettings = sqliteTable("platform_settings", {
  key:text("key").primaryKey(),
  value:text("value").notNull(),
  updatedAt:text("updated_at").notNull(),
  updatedBy:text("updated_by").notNull().default("")
});
