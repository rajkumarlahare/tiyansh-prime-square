-- Rekixo Geo Mapper V1
-- ADDITIVE ONLY: this migration does not alter, update or delete any existing project/plot/site data.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS `geo_project_settings` (
  `project_id` text PRIMARY KEY NOT NULL,
  `draft_revision` integer NOT NULL DEFAULT 0,
  `published_revision` integer NOT NULL DEFAULT 0,
  `public_enabled` integer NOT NULL DEFAULT 0 CHECK (`public_enabled` IN (0,1)),
  `published_at` text,
  `updated_at` text NOT NULL
);

CREATE TABLE IF NOT EXISTS `geo_control_points` (
  `project_id` text NOT NULL,
  `id` text NOT NULL,
  `source_x` real NOT NULL CHECK (`source_x` >= 0 AND `source_x` <= 1),
  `source_y` real NOT NULL CHECK (`source_y` >= 0 AND `source_y` <= 1),
  `longitude` real NOT NULL CHECK (`longitude` >= -180 AND `longitude` <= 180),
  `latitude` real NOT NULL CHECK (`latitude` >= -90 AND `latitude` <= 90),
  `label` text NOT NULL DEFAULT '',
  `sort_order` integer NOT NULL DEFAULT 0,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`project_id`,`id`)
);
CREATE INDEX IF NOT EXISTS `idx_geo_control_points_project_sort`
  ON `geo_control_points` (`project_id`,`sort_order`);

CREATE TABLE IF NOT EXISTS `geo_features` (
  `project_id` text NOT NULL,
  `id` text NOT NULL,
  `name` text NOT NULL DEFAULT '',
  `layer` text NOT NULL DEFAULT 'default',
  `geometry_type` text NOT NULL CHECK (`geometry_type` IN ('Point','LineString','Polygon')),
  `geometry` text NOT NULL,
  `linked_plot_id` text,
  `source` text NOT NULL DEFAULT 'manual',
  `properties` text NOT NULL DEFAULT '{}',
  `updated_at` text NOT NULL,
  PRIMARY KEY (`project_id`,`id`)
);
CREATE INDEX IF NOT EXISTS `idx_geo_features_project_layer`
  ON `geo_features` (`project_id`,`layer`,`name`);
CREATE INDEX IF NOT EXISTS `idx_geo_features_project_plot`
  ON `geo_features` (`project_id`,`linked_plot_id`);

CREATE TABLE IF NOT EXISTS `geo_sources` (
  `project_id` text NOT NULL,
  `id` text NOT NULL,
  `filename` text NOT NULL,
  `content_type` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `sha256` text NOT NULL,
  `object_key` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY (`project_id`,`id`)
);
CREATE INDEX IF NOT EXISTS `idx_geo_sources_project_created`
  ON `geo_sources` (`project_id`,`created_at`);

CREATE TABLE IF NOT EXISTS `geo_versions` (
  `project_id` text NOT NULL,
  `version` integer NOT NULL,
  `snapshot` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY (`project_id`,`version`)
);
CREATE INDEX IF NOT EXISTS `idx_geo_versions_project_created`
  ON `geo_versions` (`project_id`,`created_at`);
