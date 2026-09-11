-- Rekixo Geo Mapper V3.0.1 — project-scoped final alignment.
-- Additive only. RPK/public renderer and legacy plot geometry stay untouched.

ALTER TABLE geo_project_settings
  ADD COLUMN fine_east_m REAL NOT NULL DEFAULT 0
  CHECK (fine_east_m >= -5000 AND fine_east_m <= 5000);

ALTER TABLE geo_project_settings
  ADD COLUMN fine_north_m REAL NOT NULL DEFAULT 0
  CHECK (fine_north_m >= -5000 AND fine_north_m <= 5000);

ALTER TABLE geo_project_settings
  ADD COLUMN fine_rotation_deg REAL NOT NULL DEFAULT 0
  CHECK (fine_rotation_deg >= -180 AND fine_rotation_deg <= 180);
