import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const helperSource = await readFile(
  new URL("../app/geo-fine-alignment.ts", import.meta.url),
  "utf8",
);
const helperJs = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const helper = await import(
  `data:text/javascript;base64,${Buffer.from(helperJs).toString("base64")}`
);

const route = await readFile(
  new URL("../app/api/super-geo-mapper/route.ts", import.meta.url),
  "utf8",
);
const mapper = await readFile(
  new URL("../app/geo-mapper.tsx", import.meta.url),
  "utf8",
);
const visual = await readFile(
  new URL("../app/geo-visual-calibration.tsx", import.meta.url),
  "utf8",
);
const css = await readFile(
  new URL("../app/geo-visual-calibration.module.css", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL("../drizzle/0011_rekixo_geo_fine_alignment.sql", import.meta.url),
  "utf8",
);

test("zero Fine Align is identity", () => {
  const point = [81.123456, 21.123456];
  const anchor = [81.12, 21.12];
  assert.deepEqual(
    helper.applyGeoFineAlignment(
      point,
      anchor,
      helper.ZERO_GEO_FINE_ALIGNMENT,
    ),
    point,
  );
});

test("metric translation and rotation are stable", () => {
  const anchor = [80, 20];
  const eastTen = helper.applyGeoFineAlignment(
    anchor,
    anchor,
    { eastMeters: 10, northMeters: 0, rotationDeg: 0 },
  );
  assert.ok(eastTen[0] > anchor[0]);
  assert.ok(Math.abs(eastTen[1] - anchor[1]) < 1e-10);

  const eastPoint = [80.0001, 20];
  const rotated = helper.applyGeoFineAlignment(
    eastPoint,
    anchor,
    { eastMeters: 0, northMeters: 0, rotationDeg: 90 },
  );
  assert.ok(Math.abs(rotated[0] - anchor[0]) < 2e-8);
  assert.ok(rotated[1] > anchor[1]);
});

test("hard safety limits reject accidental huge transforms", () => {
  assert.throws(
    () =>
      helper.normalizeGeoFineAlignment({
        eastMeters: 6000,
        northMeters: 0,
        rotationDeg: 0,
      }),
    /Fine Align east offset/,
  );
  assert.throws(
    () =>
      helper.normalizeGeoFineAlignment({
        eastMeters: 0,
        northMeters: 0,
        rotationDeg: 181,
      }),
    /Fine Align rotation/,
  );
});

test("generation fingerprint includes Fine Align", () => {
  const points = [
    { id: "a", source: [0, 0], target: [80, 20] },
    { id: "b", source: [1, 0], target: [80.001, 20] },
    { id: "c", source: [1, 1], target: [80.001, 20.001] },
    { id: "d", source: [0, 1], target: [80, 20.001] },
  ];
  const base = helper.geoGenerationFingerprint(points, {
    eastMeters: 0,
    northMeters: 0,
    rotationDeg: 0,
  });
  const moved = helper.geoGenerationFingerprint(points, {
    eastMeters: 0.25,
    northMeters: 0,
    rotationDeg: 0,
  });
  assert.notEqual(base, moved);
});

test("backend persists Fine Align and snapshots it", () => {
  assert.match(route, /body\.action === "save_fine_alignment"/);
  assert.match(route, /fine_east_m=\?,fine_north_m=\?,fine_rotation_deg=\?/);
  assert.match(route, /geoCalibrationFingerprint\(\s*controlPoints,\s*fineAlignment/s);
  assert.match(
    route,
    /featureCollection: featuresToFeatureCollection\(features\),\s*controlPoints,\s*fineAlignment,/s,
  );
});

test("admin preview transforms masterplan and plot paths together", () => {
  const calls = visual.match(/applyGeoFineAlignment\(/g) || [];
  assert.ok(calls.length >= 2);
  assert.match(visual, /Fine Align drag/);
  assert.match(visual, /Save Fine Align/);
  assert.match(visual, /Drag image \+ plots together/);
  assert.match(mapper, /fineAlignmentDirty/);
  assert.match(mapper, /action: "save_fine_alignment"/);
  assert.match(
    mapper,
    /action: "generate_plot_features",\s*controlPoints,\s*fineAlignment,/s,
  );
});

test("migration is additive and RPK/public renderer remains outside this batch", () => {
  assert.match(migration, /ALTER TABLE geo_project_settings/);
  assert.match(migration, /ADD COLUMN fine_east_m/);
  assert.match(migration, /ADD COLUMN fine_north_m/);
  assert.match(migration, /ADD COLUMN fine_rotation_deg/);
  assert.doesNotMatch(migration, /\bDROP\b|\bDELETE\b|\bUPDATE plots\b/i);
  assert.match(css, /REKIXO_GEO_FINE_ALIGN_V3_0_1/);
});
