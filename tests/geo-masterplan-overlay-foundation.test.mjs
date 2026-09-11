import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("masterplan derivatives preserve transparent alpha", () => {
  const source = read("app/plot-mapper.tsx");
  assert.match(source, /getContext\("2d",\s*\{\s*alpha:\s*true\s*\}\)/);
  assert.match(source, /context\.clearRect\(0,\s*0,\s*targetWidth,\s*targetHeight\)/);
  assert.doesNotMatch(source, /getContext\("2d",\s*\{\s*alpha:\s*false\s*\}\)/);
});

test("Geo Mapper passes generated features and plot details to visual preview", () => {
  const source = read("app/geo-mapper.tsx");
  assert.match(source, /features=\{state\.features\}/);
  assert.match(source, /plots=\{state\.plots\}/);
  assert.match(source, /sqft:\s*number/);
  assert.match(source, /dimensions:\s*string/);
});

test("Satellite preview contains calibrated image overlay and clickable polygons", () => {
  const source = read("app/geo-visual-calibration.tsx");
  assert.match(source, /REKIXO_GEO_MASTERPLAN_OVERLAY_V2_7/);
  assert.match(source, /new google\.maps\.OverlayView\(\)/);
  assert.match(source, /new google\.maps\.Polygon\(/);
  assert.match(source, /new google\.maps\.InfoWindow\(\)/);
  assert.match(source, /Masterplan overlay preview/);
  assert.match(source, /Clickable plots/);
  assert.match(source, /solveGeoCalibration/);
  assert.match(source, /mapNormalizedPointToGeo/);
  assert.match(source, /solveHomography/);
  assert.match(source, /suppressNextMapClickRef/);
});

test("generated Geo features remain linked to project plots", () => {
  const source = read("app/api/super-geo-mapper/route.ts");
  assert.match(source, /linkedPlotId:\s*plot\.id/);
  assert.match(source, /source:\s*"plot_mapper"/);
  assert.match(source, /SELECT id,status,sqft,sqm,sqyd,dimensions,road,polygon FROM plots/);
});

test("current public renderer stays untouched in this admin QA patch", () => {
  const source = read("public/project/index.html");
  assert.match(source, /class="master/);
  assert.match(source, /class="hotspots/);
  assert.doesNotMatch(source, /REKIXO_GEO_MASTERPLAN_OVERLAY_V2_7/);
});
