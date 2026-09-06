CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`public_host` text,
	`admin_host` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_unique` ON `projects` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_public_host_unique` ON `projects` (`public_host`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_admin_host_unique` ON `projects` (`admin_host`);--> statement-breakpoint
INSERT INTO `projects` (`id`,`name`,`slug`,`status`,`created_at`,`updated_at`) VALUES ('tiyansh-prime-square','The Prime Square','tiyansh-prime-square','active',datetime('now'),datetime('now'));--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_gallery` (
	`project_id` text DEFAULT 'tiyansh-prime-square' NOT NULL,
	`id` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_gallery`("project_id", "id", "object_key", "filename", "content_type", "caption", "sort_order", "created_at") SELECT 'tiyansh-prime-square', "id", "object_key", "filename", "content_type", "caption", "sort_order", "created_at" FROM `gallery`;--> statement-breakpoint
DROP TABLE `gallery`;--> statement-breakpoint
ALTER TABLE `__new_gallery` RENAME TO `gallery`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `gallery_object_key_unique` ON `gallery` (`object_key`);--> statement-breakpoint
CREATE TABLE `__new_plots` (
	`project_id` text DEFAULT 'tiyansh-prime-square' NOT NULL,
	`id` text NOT NULL,
	`sqft` real NOT NULL,
	`sqm` real NOT NULL,
	`sqyd` real NOT NULL,
	`dimensions` text NOT NULL,
	`road` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_plots`("project_id", "id", "sqft", "sqm", "sqyd", "dimensions", "road", "status", "notes", "featured", "updated_at") SELECT 'tiyansh-prime-square', "id", "sqft", "sqm", "sqyd", "dimensions", "road", "status", "notes", "featured", "updated_at" FROM `plots`;--> statement-breakpoint
DROP TABLE `plots`;--> statement-breakpoint
ALTER TABLE `__new_plots` RENAME TO `plots`;--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`project_id` text DEFAULT 'tiyansh-prime-square' NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `key`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_settings`("project_id", "key", "value", "updated_at") SELECT 'tiyansh-prime-square', "key", "value", "updated_at" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;--> statement-breakpoint
CREATE TABLE `__new_admin_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`project_id` text NOT NULL,
	`role` text DEFAULT 'client_admin' NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`must_change_password` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_login_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_admin_users` SELECT `id`,`email`,`name`,'tiyansh-prime-square',`role`,`password_hash`,`password_salt`,`status`,`must_change_password`,`created_at`,`updated_at`,`last_login_at` FROM `admin_users`;--> statement-breakpoint
DROP TABLE `admin_users`;--> statement-breakpoint
ALTER TABLE `__new_admin_users` RENAME TO `admin_users`;--> statement-breakpoint
CREATE UNIQUE INDEX `admin_users_email_unique` ON `admin_users` (`email`);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA optimize;
