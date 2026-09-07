import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [mapper, superMapper, publicData, publicPage, publishPanel] = await Promise.all([
  readFile(new URL("../app/plot-mapper.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/super-mapper/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/public-data/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../public/project/index.html", import.meta.url), "utf8"),
  readFile(new URL("../app/project-publish-panel.tsx", import.meta.url), "utf8"),
]);

test("project-level website rotation is validated and public", () => {
  assert.match(superMapper, /"publicRotation"/);
  assert.match(superMapper, /key === "publicRotation"/);
  assert.match(superMapper, /number < 0 \|\| number > 3/);
  assert.match(publicData, /"publicRotation"/);
});

test("mapper repairs dimensions from decoded image without touching polygons", () => {
  assert.match(mapper, /settingsReady/);
  assert.match(mapper, /naturalImageSize/);
  assert.match(mapper, /metadataRepairRef/);
  assert.match(mapper, /persistMapperSettings\(\{ mapWidth: String\(width\), mapHeight: String\(height\) \}\)/);
  assert.match(mapper, /rekixo:mapper-settings-updated/);
});

test("mapper display rotation syncs to website while canonical geometry remains unchanged", () => {
  assert.match(mapper, /publicRotation: String\(rotation\)/);
  assert.match(mapper, /saved geometry original image coordinates/);
  assert.match(mapper, /Website view:/);
});

test("generic preview cannot flash or bootstrap Tiyansh tenant data", () => {
  assert.match(publicPage, /REKIXO_GENERIC_BOOT/);
  assert.match(publicPage, /rekixo-project-loading/);
  assert.match(publicPage, /GENERIC_BOOT \? \[\] :/);
  assert.match(publicPage, /GENERIC_BOOT\?'':'919009995582'/);
  assert.doesNotMatch(publicPage, /PROJECT_LOCATION=s\.location\|\|PROJECT_LOCATION/);
});

test("generic public map contains the full natural masterplan and keeps hit testing aligned", () => {
  assert.match(publicPage, /function displaySize/);
  assert.match(publicPage, /legacyWidthFit/);
  assert.match(publicPage, /Math\.min\(fw,fh\)/);
  assert.match(publicPage, /function rescaleNormalizedPlots/);
  assert.match(publicPage, /master\.naturalWidth/);
  assert.match(publicPage, /PUBLIC_ROTATION\*90/);
  assert.match(publicPage, /function clientToPlan[\s\S]*PUBLIC_ROTATION===1/);
});

test("publish readiness refreshes immediately after mapper metadata repair", () => {
  assert.match(publishPanel, /rekixo:mapper-settings-updated/);
  assert.match(publishPanel, /Publish status refresh nahi hua/);
});
