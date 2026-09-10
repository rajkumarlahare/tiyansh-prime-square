import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../drizzle/0009_rekixo_geo_mapper.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/super-geo-mapper/route.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../app/super-admin-dashboard.tsx", import.meta.url), "utf8");
const geoUi = readFileSync(new URL("../app/geo-mapper.tsx", import.meta.url), "utf8");
const geoCss = readFileSync(new URL("../app/geo-mapper.module.css", import.meta.url), "utf8");
const adminUsers = readFileSync(new URL("../app/api/admin/users/route.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");

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

test("Geo generation requires the exact saved calibration", () => {
  assert.match(geoUi, /calibrationDirty/);
  assert.match(geoUi, /generate_plot_features", controlPoints/);
  assert.match(route, /sameControlPoints\(requestedControlPoints, controlPoints\)/);
  assert.match(route, /Calibration badli hai/);
});

test("Geo publish is append-only and protected by draft revision CAS", () => {
  assert.match(geoUi, /expectedDraftRevision: state\.publish\.draftRevision/);
  assert.match(route, /INSERT OR IGNORE INTO geo_versions/);
  assert.match(route, /WHERE project_id=\? AND draft_revision=\?/);
  assert.doesNotMatch(route, /ON CONFLICT\(project_id,version\) DO UPDATE/);
});

test("Imported sources are archived first and retries use stable IDs", () => {
  assert.match(geoUi, /stableImportId/);
  assert.match(geoUi, /Archive first so every live import has source provenance/);
  assert.match(route, /WHERE project_id=\? AND sha256=\?/);
});

test("Linked Geo plot references must belong to the selected project", () => {
  assert.match(route, /assertLinkedPlotsExist/);
  assert.match(route, /SELECT id FROM plots WHERE project_id=\? AND id IN/);
  assert.doesNotMatch(route, /properties:\s*\{\s*plotStatus:/);
});

test("Deleting the last project admin also cleans isolated Geo rows", () => {
  for (const table of ["geo_versions", "geo_sources", "geo_features", "geo_control_points", "geo_project_settings"]) {
    assert.match(adminUsers, new RegExp(`DELETE FROM ${table} WHERE project_id=\\?`));
  }
});

test("Drizzle schema mirrors the existing Geo tables", () => {
  for (const symbol of ["geoProjectSettings", "geoControlPoints", "geoFeatures", "geoSources", "geoVersions"]) {
    assert.match(schema, new RegExp(`export const ${symbol} = sqliteTable`));
  }
});

test("Geo workspace follows the dark Super Admin visual system", () => {
  assert.match(geoCss, /\.block, \.previewBlock, \.sources \{[^}]*background: #0b1728/s);
  assert.match(geoCss, /background: #071221; color: #eef4ff/);
});
