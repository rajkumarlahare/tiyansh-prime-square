CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`project_id` text,
	`target_id` text,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_project_created` ON `audit_logs` (`project_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `admin_users` ADD `session_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `admin_users` ADD `password_changed_at` text;