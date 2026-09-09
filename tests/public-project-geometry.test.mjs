import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../public/project/project-geometry.js", import.meta.url), "utf8");
const context = { globalThis: {} };
vm.runInNewContext(source, context);
const geometry = context.globalThis.RekixoProjectGeometry;

test("shared public geometry exposes deterministic label helpers", () => {
  assert.ok(geometry);
  assert.equal(typeof geometry.labelPoint, "function");
  assert.equal(typeof geometry.pointInPolygon, "function");
  assert.equal(typeof geometry.polygonCentroid, "function");
});

test("rectangle label point remains centered and inside", () => {
  const polygon = [[0, 0], [4, 0], [4, 2], [0, 2]];
  const point = geometry.labelPoint(polygon);
  assert.ok(geometry.pointInPolygon(point, polygon));
  assert.ok(Math.abs(point[0] - 2) < 1e-9);
  assert.ok(Math.abs(point[1] - 1) < 1e-9);
});

test("concave plot gets an interior label point instead of an outside arithmetic/area center", () => {
  const polygon = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]];
  const point = geometry.labelPoint(polygon);
  assert.ok(Number.isFinite(point[0]) && Number.isFinite(point[1]));
  assert.ok(geometry.pointInPolygon(point, polygon));
});

test("label calculation never mutates stored canonical polygon coordinates", () => {
  const polygon = [[0.1, 0.2], [0.8, 0.2], [0.7, 0.9], [0.2, 0.8]];
  const before = JSON.stringify(polygon);
  geometry.labelPoint(polygon);
  assert.equal(JSON.stringify(polygon), before);
});
