CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`window_start` integer NOT NULL
);
