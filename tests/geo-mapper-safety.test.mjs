import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../drizzle/0009_rekixo_geo_mapper.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/super-geo-mapper/route.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../app/super-admin-dashboard.tsx", import.meta.url), "utf8");

test("Geo migration is additive and isolated from current project tables", () => {
  assert.match(migration, /ADDITIVE ONLY/i);
  assert.doesNotMatch(migration, /\b(?:ALTER|DROP|DELETE|UPDATE)\s+(?:TABLE\s+)?(?:projects|plots|settings|gallery|admin_users)\b/i);
  for (const table of ["geo_project_settings", "geo_control_points", "geo_features", "geo_sources", "geo_versions"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS .${table}.`));
  }
});

test("Geo API reads Plot Mapper polygons but never mutates core plots", () => {
  assert.match(route, /SELECT id,status,polygon FROM plots/);
  assert.doesNotMatch(route, /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+plots\b/i);
  assert.match(route, /requireSuperAdmin/);
  assert.match(route, /sameOrigin/);
});

test("Geo UI is a separate Super Admin workspace", () => {
  assert.match(dashboard, /<Globe2 \/> Geo Mapper/);
  assert.match(dashboard, /tab === "geo"/);
  assert.match(dashboard, /<GeoMapper key=\{projectId\}/);
});
