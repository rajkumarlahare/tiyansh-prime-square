import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const calibration = readFileSync(
  new URL("../app/geo-calibration.ts", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../app/api/super-geo-mapper/route.ts", import.meta.url),
  "utf8",
);
const mapper = readFileSync(
  new URL("../app/geo-mapper.tsx", import.meta.url),
  "utf8",
);
const visual = readFileSync(
  new URL("../app/geo-visual-calibration.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("../app/geo-visual-calibration.module.css", import.meta.url),
  "utf8",
);

test("Geo calibration exposes independent leave-one-out diagnostics for 5+ points", () => {
  assert.match(calibration, /export function geoCalibrationDiagnostics/);
  assert.match(
    calibration,
    /points\.filter\(\(_, candidateIndex\) => candidateIndex !== index\)/,
  );
  assert.match(calibration, /validationMeanErrorMeters/);
  assert.match(calibration, /validationMaxErrorMeters/);
  assert.match(calibration, /worstPointId/);
});

test("four-point exact fit is not presented as independent accuracy proof", () => {
  assert.match(mapper, /"Exact-fit"/);
  assert.match(mapper, /Add 1\+ independent point to validate/);
  assert.match(visual, /4-point exact-fit only/);
  assert.match(visual, /independent accuracy/);
});

test("worst calibration point is visible directly in the pairing tabs", () => {
  assert.match(visual, /diagnosticById/);
  assert.match(visual, /styles\.pointWorst/);
  assert.match(visual, /Leave-one-out residual/);
  assert.match(css, /\.pointTabs button\.pointWorst/);
  assert.match(css, /\.diagnosticsWarn/);
});

test("generated Plot Mapper Geo polygons are tied to the saved calibration", () => {
  assert.match(route, /function geoCalibrationFingerprint/);
  assert.match(route, /properties: \{ calibrationFingerprint \}/);
  assert.match(mapper, /geoPlotGenerationFresh/);
  assert.match(mapper, /Saved calibration aur generated Plot Mapper Geo polygons match nahi karte/);
});

test("Geo publish rejects stale generated polygons server-side", () => {
  assert.match(route, /feature\.properties\?\.calibrationFingerprint/);
  assert.match(route, /Calibration ke baad Geo plots regenerate nahi hue/);
  assert.match(mapper, /publishBlockedByStalePlots/);
});

test("Geo regeneration removes only stale isolated plot_mapper features", () => {
  assert.match(route, /staleGeneratedIds/);
  assert.match(
    route,
    /DELETE FROM geo_features WHERE project_id=\? AND id=\? AND source='plot_mapper'/,
  );
  assert.doesNotMatch(route, /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+plots\b/i);
});

test("diagnostic patch remains isolated from stable customer/public routes", () => {
  assert.doesNotMatch(visual, /\/api\/super-mapper/);
  assert.doesNotMatch(visual, /\/api\/admin\/publish/);
  assert.doesNotMatch(mapper, /\/api\/admin\/plots/);
});
