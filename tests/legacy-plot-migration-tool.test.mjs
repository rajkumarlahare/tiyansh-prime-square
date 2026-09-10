import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLegacyPlotMigrationSql,
  normalizeLegacyPlotRows,
} from "../scripts/build-legacy-plot-migration.mjs";

test("pixel legacy bundle normalizes into canonical 0..1 polygons", () => {
  const rows = normalizeLegacyPlotRows({
    input: [
      {
        id: "P-1",
        points: [[10, 20], [90, 20], [90, 180], [10, 180]],
        sqft: 900,
        dimensions: "30' x 30'",
        road: "20' road",
        status: "enquire",
      },
    ],
    sourceWidth: 100,
    sourceHeight: 200,
    coordinateSpace: "pixels",
  });

  assert.equal(rows.length, 1);
  assert.deepEqual(JSON.parse(rows[0].polygon), [
    [0.1, 0.1],
    [0.9, 0.1],
    [0.9, 0.9],
    [0.1, 0.9],
  ]);
  assert.equal(rows[0].status, "available");
  assert.equal(rows[0].sqm > 0, true);
  assert.equal(rows[0].sqyd, 100);
});

test("normalized mapper backup remains normalized and generic for any project", () => {
  const rows = normalizeLegacyPlotRows({
    input: {
      coordinateSpace: "normalized",
      plots: [
        {
          id: "X-2",
          polygon: "[[0.1,0.2],[0.8,0.2],[0.7,0.9]]",
          sqm: 100,
        },
      ],
    },
    coordinateSpace: "normalized",
    initialStatus: "sold",
  });
  assert.deepEqual(JSON.parse(rows[0].polygon), [[0.1, 0.2], [0.8, 0.2], [0.7, 0.9]]);
  assert.equal(rows[0].status, "sold");

  const sql = buildLegacyPlotMigrationSql({
    projectId: "future-project-2027",
    rows,
    coordinateSpace: "normalized",
    sourceLabel: "future-import",
  });
  assert.match(sql, /future-project-2027/);
  assert.doesNotMatch(sql, /tiyansh-prime-square/);
});

test("generated upsert replaces geometry but preserves operational status, notes and featured", () => {
  const rows = normalizeLegacyPlotRows({
    input: [{ id: "A-1", points: [[0, 0], [100, 0], [100, 100]], sqft: 1000 }],
    sourceWidth: 100,
    sourceHeight: 100,
  });
  const sql = buildLegacyPlotMigrationSql({
    projectId: "sample-project",
    rows,
    sourceWidth: 100,
    sourceHeight: 100,
  });

  assert.match(sql, /`polygon`=excluded\.`polygon`/);
  assert.match(sql, /`dimensions`=excluded\.`dimensions`/);
  assert.doesNotMatch(sql, /`status`=excluded\.`status`/);
  assert.doesNotMatch(sql, /`notes`=excluded\.`notes`/);
  assert.doesNotMatch(sql, /`featured`=excluded\.`featured`/);
});

test("duplicate IDs and out-of-bounds points are rejected before SQL generation", () => {
  assert.throws(
    () => normalizeLegacyPlotRows({
      input: [
        { id: "A-1", points: [[0, 0], [50, 0], [50, 50]] },
        { id: "A-1", points: [[0, 0], [40, 0], [40, 40]] },
      ],
      sourceWidth: 100,
      sourceHeight: 100,
    }),
    /Duplicate plot id/,
  );

  assert.throws(
    () => normalizeLegacyPlotRows({
      input: [{ id: "A-2", points: [[0, 0], [101, 0], [50, 50]] }],
      sourceWidth: 100,
      sourceHeight: 100,
    }),
    /source bounds/,
  );
});
