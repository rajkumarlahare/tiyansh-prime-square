-- Rekixo platform settings V1
-- ADDITIVE ONLY: no existing project, plot, client, domain, Geo or public-site data is altered.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS `platform_settings` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by` text NOT NULL DEFAULT ''
);
