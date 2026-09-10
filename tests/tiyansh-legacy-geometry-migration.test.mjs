import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildLegacyPlotMigrationSql,
  normalizeLegacyPlotRows,
} from "../scripts/build-legacy-plot-migration.mjs";

const source = JSON.parse(
  await readFile(new URL("../public/plots.json", import.meta.url), "utf8"),
);
const migration = await readFile(
  new URL("../drizzle/0008_tiyansh_legacy_geometry_recovery.sql", import.meta.url),
  "utf8",
);

const rows = normalizeLegacyPlotRows({
  input: source,
  sourceWidth: 1200,
  sourceHeight: 2133,
  coordinateSpace: "pixels",
  initialStatus: "available",
});

const expected = buildLegacyPlotMigrationSql({
  projectId: "tiyansh-prime-square",
  rows,
  sourceWidth: 1200,
  sourceHeight: 2133,
  coordinateSpace: "pixels",
  sourceLabel: "tiyansh-manual-legacy-v1",
  inputName: "plots.json",
});

test("Tiyansh recovery is deterministic and exactly matches the preserved manual source", () => {
  assert.equal(source.length, 28);
  assert.equal(rows.length, 28);
  assert.equal(new Set(rows.map((row) => row.id)).size, 28);
  assert.equal(migration, expected);
});

test("every recovered point round-trips to the original 1200 x 2133 pixel map", () => {
  for (let i = 0; i < source.length; i += 1) {
    const original = source[i];
    const normalized = JSON.parse(rows[i].polygon);
    assert.equal(normalized.length, original.points.length, original.id);
    for (let p = 0; p < normalized.length; p += 1) {
      assert.ok(Math.abs(normalized[p][0] * 1200 - original.points[p][0]) < 1e-8, `${original.id} x${p}`);
      assert.ok(Math.abs(normalized[p][1] * 2133 - original.points[p][1]) < 1e-8, `${original.id} y${p}`);
      assert.ok(normalized[p][0] >= 0 && normalized[p][0] <= 1, `${original.id} x range`);
      assert.ok(normalized[p][1] >= 0 && normalized[p][1] <= 1, `${original.id} y range`);
    }
  }
});

test("recovery migration is Tiyansh-only and cannot overwrite live sales state", () => {
  const projectValues = [...migration.matchAll(/VALUES \('([^']+)'/g)].map((match) => match[1]);
  assert.ok(projectValues.length >= 32);
  assert.deepEqual(new Set(projectValues), new Set(["tiyansh-prime-square"]));
  assert.doesNotMatch(migration, /\brpk\b/i);
  assert.doesNotMatch(migration, /`status`=excluded\.`status`/);
  assert.doesNotMatch(migration, /`notes`=excluded\.`notes`/);
  assert.doesNotMatch(migration, /`featured`=excluded\.`featured`/);
  assert.match(migration, /geometryImportCount','28'/);
  assert.match(migration, /mapWidth','1200'/);
  assert.match(migration, /mapHeight','2133'/);
});
