CREATE TABLE `gallery` (
	`id` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gallery_object_key_unique` ON `gallery` (`object_key`);--> statement-breakpoint
CREATE TABLE `plots` (
	`id` text PRIMARY KEY NOT NULL,
	`sqft` real NOT NULL,
	`sqm` real NOT NULL,
	`sqyd` real NOT NULL,
	`dimensions` text NOT NULL,
	`road` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
