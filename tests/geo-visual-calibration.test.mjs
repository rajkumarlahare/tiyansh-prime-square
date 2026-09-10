import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const geo = readFileSync(new URL("../app/geo-mapper.tsx", import.meta.url), "utf8");
const visual = readFileSync(
  new URL("../app/geo-visual-calibration.tsx", import.meta.url),
  "utf8",
);
const config = readFileSync(
  new URL("../app/api/super-geo-map-config/route.ts", import.meta.url),
  "utf8",
);

test("visual calibration is mounted only inside the isolated Geo workspace", () => {
  assert.match(geo, /import GeoVisualCalibration from "\.\/geo-visual-calibration"/);
  assert.match(geo, /<GeoVisualCalibration/);
  assert.match(visual, /if \(!config\?\.lab\) return null/);
});

test("masterplan visual picker only edits Geo control-point state", () => {
  assert.match(visual, /api\/project-asset\/masterplan\?projectId=/);
  assert.match(visual, /source: \[Number\(x\.toFixed\(7\)\), Number\(y\.toFixed\(7\)\)\]/);
  assert.doesNotMatch(visual, /\/api\/super-mapper/);
  assert.doesNotMatch(visual, /\/api\/admin\/plots/);
});

test("satellite target picker uses official Google Maps JS endpoint and satellite mode", () => {
  assert.match(visual, /https:\/\/maps\.googleapis\.com\/maps\/api\/js\?/);
  assert.match(visual, /mapTypeId: "satellite"/);
  assert.match(visual, /target: \[lng, lat\]/);
});

test("browser map configuration is Super Admin and Geo Lab scoped", () => {
  assert.match(config, /requireSuperAdmin/);
  assert.match(config, /geoLabMode/);
  assert.match(config, /GOOGLE_MAPS_BROWSER_KEY/);
  assert.match(config, /private,no-store/);
});

test("map config endpoint is read-only", () => {
  assert.doesNotMatch(
    config,
    /\b(?:INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER)\b\s+(?:INTO\s+|FROM\s+|TABLE\s+)?(?:projects|plots|settings|geo_)/i,
  );
});
