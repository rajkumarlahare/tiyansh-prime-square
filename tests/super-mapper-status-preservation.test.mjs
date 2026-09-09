import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/api/super-mapper/route.ts", import.meta.url), "utf8");

test("mapper geometry upsert preserves live Booked/Sold and featured state on existing plots", () => {
  assert.match(source, /polygon=excluded\.polygon,notes=excluded\.notes,updated_at=excluded\.updated_at/);
  assert.doesNotMatch(source, /polygon=excluded\.polygon,status=excluded\.status/);
  assert.doesNotMatch(source, /notes=excluded\.notes,featured=excluded\.featured/);
});

test("new mapper rows can still insert an initial status while conflict updates remain geometry-only", () => {
  assert.match(source, /INSERT INTO plots \(project_id,id,sqft,sqm,sqyd,dimensions,road,polygon,status,notes,featured,updated_at\)/);
  assert.match(source, /const statement = preserveGeometry/);
});
