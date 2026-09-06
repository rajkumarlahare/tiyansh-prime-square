import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const plots = sqliteTable("plots", { id:text("id").primaryKey(), sqft:real("sqft").notNull(), sqm:real("sqm").notNull(), sqyd:real("sqyd").notNull(), dimensions:text("dimensions").notNull(), road:text("road").notNull(), status:text("status").notNull().default("available"), notes:text("notes").notNull().default(""), featured:integer("featured",{mode:"boolean"}).notNull().default(false), updatedAt:text("updated_at").notNull() });
export const settings = sqliteTable("settings", { key:text("key").primaryKey(), value:text("value").notNull(), updatedAt:text("updated_at").notNull() });
export const gallery = sqliteTable("gallery", { id:text("id").primaryKey(), objectKey:text("object_key").notNull().unique(), filename:text("filename").notNull(), contentType:text("content_type").notNull(), caption:text("caption").notNull().default(""), sortOrder:integer("sort_order").notNull().default(0), createdAt:text("created_at").notNull() });
export const loginAttempts = sqliteTable("login_attempts", { key:text("key").primaryKey(), attempts:integer("attempts").notNull().default(0), windowStart:integer("window_start").notNull() });
export const adminUsers = sqliteTable("admin_users", {
  id:text("id").primaryKey(), email:text("email").notNull().unique(), name:text("name").notNull(),
  role:text("role").notNull().default("client_admin"), passwordHash:text("password_hash").notNull(),
  passwordSalt:text("password_salt").notNull(), status:text("status").notNull().default("active"),
  mustChangePassword:integer("must_change_password",{mode:"boolean"}).notNull().default(true),
  createdAt:text("created_at").notNull(), updatedAt:text("updated_at").notNull(), lastLoginAt:text("last_login_at")
});
