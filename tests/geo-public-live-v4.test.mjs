import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const liveRoute = readFileSync(
  new URL("../app/api/super-geo-live/route.ts", import.meta.url),
  "utf8",
);
const overlayRoute = readFileSync(
  new URL("../app/api/super-geo-overlay/route.ts", import.meta.url),
  "utf8",
);
const publicRoute = readFileSync(
  new URL("../app/api/public-geo/route.ts", import.meta.url),
  "utf8",
);
const publicAsset = readFileSync(
  new URL("../app/api/public-geo-masterplan/route.ts", import.meta.url),
  "utf8",
);
const geoMapper = readFileSync(
  new URL("../app/geo-mapper.tsx", import.meta.url),
  "utf8",
);
const visual = readFileSync(
  new URL("../app/geo-visual-calibration.tsx", import.meta.url),
  "utf8",
);
const editor = readFileSync(
  new URL("../app/masterplan-mask-editor.tsx", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../app/projects/[slug]/map/page.tsx", import.meta.url),
  "utf8",
);
const client = readFileSync(
  new URL("../app/projects/[slug]/map/geo-public-map.tsx", import.meta.url),
  "utf8",
);

test("Geo Lab promotion points customer project at immutable published Geo revision", () => {
  assert.match(liveRoute, /geoLabSourceProjectId/);
  assert.match(liveRoute, /publishedRevision/);
  assert.match(liveRoute, /geo_versions WHERE project_id=\? AND version=\?/);
  assert.match(liveRoute, /geoPublicLabProjectId/);
  assert.match(liveRoute, /geoPublicRevision/);
  assert.match(liveRoute, /geoPublicOverlayKey/);
  assert.match(liveRoute, /geoPublicToken/);
  assert.doesNotMatch(liveRoute, /UPDATE projects SET public_status/);
  assert.doesNotMatch(liveRoute, /UPDATE plots SET/);
});

test("Promotion freezes an overlay copy instead of exposing mutable Geo Lab mapper assets", () => {
  assert.match(liveRoute, /geo\/promoted\/\$\{revision\}\/\$\{token\}/);
  assert.match(liveRoute, /env\.BUCKET\.put\(promotedOverlayKey/);
  assert.match(liveRoute, /normalProjectPublishChanged: false/);
  assert.match(liveRoute, /plotBusinessStateChanged: false/);
});

test("Mask editor can persist exact transparent live overlay into isolated Geo Lab R2", () => {
  assert.match(visual, /projectId=\{projectId\}/);
  assert.match(editor, /projectId: string/);
  assert.match(editor, /super-geo-overlay/);
  assert.match(editor, /Save live overlay/);
  assert.match(overlayRoute, /geo\/public-overlay\.png/);
  assert.match(overlayRoute, /requireSuperAdmin/);
  assert.match(overlayRoute, /sameOrigin/);
});

test("Public Geo endpoint resolves only published customer project and owned promoted lab snapshot", () => {
  assert.match(publicRoute, /projectBySlug\(slug\)/);
  assert.match(publicRoute, /geoPublicEnabled/);
  assert.match(publicRoute, /validLabLink/);
  assert.match(publicRoute, /geo_versions WHERE project_id=\? AND version=\?/);
  assert.match(publicRoute, /applyGeoFineAlignment/);
  assert.match(publicRoute, /mapNormalizedPointToGeo/);
  assert.doesNotMatch(publicRoute, /\bnotes\b/);
});

test("Public masterplan route accepts only promoted R2 key under the owned Geo Lab prefix", () => {
  assert.match(publicAsset, /expectedPrefix = `projects\/\$\{labProjectId\}\/geo\/promoted\//);
  assert.match(publicAsset, /overlayKey\.startsWith\(expectedPrefix\)/);
  assert.match(publicAsset, /requestedToken !== token/);
});

test("Customer map page uses Google Satellite plus projective masterplan and clickable polygons", () => {
  assert.match(page, /isPlatformAccessHost/);
  assert.match(page, /projectBySlug/);
  assert.match(client, /mapTypeId: "satellite"/);
  assert.match(client, /new google\.maps\.OverlayView/);
  assert.match(client, /solveHomography/);
  assert.match(client, /new google\.maps\.Polygon/);
  assert.match(client, /new google\.maps\.InfoWindow/);
});

test("Geo Mapper exposes explicit promote and customer-link workflow without changing normal publish", () => {
  assert.match(geoMapper, /Customer Satellite Live/);
  assert.match(geoMapper, /Promote Published Geo/);
  assert.match(geoMapper, /Copy Customer Map Link/);
  assert.match(geoMapper, /\/api\/super-geo-live/);
});
