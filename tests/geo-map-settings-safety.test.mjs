import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  new URL("../app/api/super-geo-map-config/route.ts", import.meta.url),
  "utf8",
);
const visual = readFileSync(
  new URL("../app/geo-visual-calibration.tsx", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../drizzle/0010_rekixo_platform_settings.sql", import.meta.url),
  "utf8",
);
const schema = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");

test("Maps key storage is global and isolated from project/customer settings", () => {
  assert.match(route, /platform_settings/);
  assert.match(route, /MAPS_KEY_SETTING = "google_maps_browser_key"/);
  assert.doesNotMatch(
    route,
    /(?:INSERT|UPDATE|REPLACE|DELETE)\s+(?:INTO\s+|FROM\s+)?settings\b/i,
  );
  assert.doesNotMatch(
    route,
    /(?:INSERT|UPDATE|REPLACE|DELETE)\s+(?:INTO\s+|FROM\s+)?(?:projects|plots|admin_users|project_domains|geo_)/i,
  );
});

test("Maps key writes require Super Admin, same origin and a Geo Lab project", () => {
  assert.match(route, /requireSuperAdmin/);
  assert.match(route, /sameOrigin/);
  assert.match(route, /projectIsGeoLab/);
  assert.match(route, /Maps settings sirf GEO LAB workspace me change ho sakti hain/);
});

test("Cloudflare environment key remains a non-breaking fallback", () => {
  assert.match(route, /GOOGLE_MAPS_BROWSER_KEY/);
  assert.match(route, /source: envValue \? "env" : null/);
  assert.match(route, /savedValue.*source: "saved"/s);
});

test("Saved key is audited without writing the raw key into audit details", () => {
  assert.match(route, /geo\.maps_key_saved/);
  assert.match(route, /geo\.maps_key_cleared/);
  assert.match(route, /\{ storage: "platform_settings", browserRestricted: true \}/);
  assert.doesNotMatch(route, /details:\s*\{[^}]*apiKey/s);
});

test("Super Admin UI accepts a new key but never pre-fills the raw configured key", () => {
  assert.match(visual, /type="password"/);
  assert.match(visual, /Save Maps Key/);
  assert.match(visual, /maskedKey/);
  assert.doesNotMatch(visual, /value=\{config\.apiKey\}/);
});

test("platform settings migration is additive only", () => {
  assert.match(migration, /ADDITIVE ONLY/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `platform_settings`/);
  assert.doesNotMatch(
    migration,
    /\b(?:ALTER|DROP|UPDATE|DELETE)\b\s+(?:TABLE\s+|FROM\s+)?(?:projects|plots|settings|admin_users|project_domains|geo_)/i,
  );
});

test("Drizzle schema mirrors platform settings table", () => {
  assert.match(schema, /export const platformSettings = sqliteTable\("platform_settings"/);
});
