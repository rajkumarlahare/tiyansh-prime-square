-- Rekixo Geo Mapper V3.2 — project-scoped uniform Fine Align scale.
-- Additive only. Existing projects keep exact current size with DEFAULT 1.
-- RPK/public renderer and legacy plot geometry stay untouched.

ALTER TABLE geo_project_settings
  ADD COLUMN fine_scale REAL NOT NULL DEFAULT 1
  CHECK (fine_scale >= 0.5 AND fine_scale <= 1.5);
