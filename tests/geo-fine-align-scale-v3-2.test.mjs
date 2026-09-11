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
  `data:text/javascript;base64,${Buffer.from(helperJs).toString("base64")}`,
);

const route = await readFile(
  new URL("../app/api/super-geo-mapper/route.ts", import.meta.url),
  "utf8",
);
const visual = await readFile(
  new URL("../app/geo-visual-calibration.tsx", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL("../drizzle/0012_rekixo_geo_fine_scale.sql", import.meta.url),
  "utf8",
);

test("legacy Fine Align without scale normalizes to 100 percent", () => {
  assert.deepEqual(
    helper.normalizeGeoFineAlignment({
      eastMeters: 1,
      northMeters: -2,
      rotationDeg: 3,
    }),
    { eastMeters: 1, northMeters: -2, rotationDeg: 3, scale: 1 },
  );
});

test("uniform scale compresses every direction around the same anchor", () => {
  const anchor = [80, 20];
  const east = [80.001, 20];
  const north = [80, 20.001];
  const eastHalf = helper.applyGeoFineAlignment(east, anchor, {
    eastMeters: 0,
    northMeters: 0,
    rotationDeg: 0,
    scale: 0.5,
  });
  const northHalf = helper.applyGeoFineAlignment(north, anchor, {
    eastMeters: 0,
    northMeters: 0,
    rotationDeg: 0,
    scale: 0.5,
  });
  assert.ok(Math.abs(eastHalf[0] - (80.0005)) < 2e-8);
  assert.ok(Math.abs(eastHalf[1] - 20) < 2e-8);
  assert.ok(Math.abs(northHalf[1] - 20.0005) < 2e-8);
  assert.ok(Math.abs(northHalf[0] - 80) < 2e-8);
});

test("scale safety limits reject accidental extreme compression or expansion", () => {
  assert.throws(
    () =>
      helper.normalizeGeoFineAlignment({
        eastMeters: 0,
        northMeters: 0,
        rotationDeg: 0,
        scale: 0.49,
      }),
    /Fine Align scale/,
  );
  assert.throws(
    () =>
      helper.normalizeGeoFineAlignment({
        eastMeters: 0,
        northMeters: 0,
        rotationDeg: 0,
        scale: 1.51,
      }),
    /Fine Align scale/,
  );
});

test("generation fingerprint changes when only scale changes", () => {
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
    scale: 1,
  });
  const compressed = helper.geoGenerationFingerprint(points, {
    eastMeters: 0,
    northMeters: 0,
    rotationDeg: 0,
    scale: 0.999,
  });
  assert.notEqual(base, compressed);
});

test("backend loads and saves uniform scale with Fine Align", () => {
  assert.match(route, /fine_scale AS scale/);
  assert.match(route, /fine_scale AS fineScale/);
  assert.match(
    route,
    /fine_east_m=\?,fine_north_m=\?,fine_rotation_deg=\?,fine_scale=\?/,
  );
  assert.match(route, /fineAlignment\.scale/);
});

test("admin provides uniform Compress and Expand controls", () => {
  assert.match(visual, /fineScaleStep/);
  assert.match(visual, /function scaleFineAlignment/);
  assert.match(visual, /Compress −/);
  assert.match(visual, /Expand \+/);
  assert.match(visual, /Scale\{" "\}/);
  assert.match(visual, /scale: 1/);
});

test("scale migration is additive with identity default", () => {
  assert.match(migration, /ALTER TABLE geo_project_settings/);
  assert.match(migration, /ADD COLUMN fine_scale REAL NOT NULL DEFAULT 1/);
  assert.match(migration, /fine_scale >= 0\.5 AND fine_scale <= 1\.5/);
  assert.doesNotMatch(migration, /\bDROP\b|\bDELETE\b|\bUPDATE plots\b/i);
});
