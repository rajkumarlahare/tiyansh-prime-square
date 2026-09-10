import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mapper = await readFile(new URL("../app/plot-mapper.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/super-mapper/route.ts", import.meta.url), "utf8");

test("masterplan same-file retries are deterministic without changing other uploaders", () => {
  assert.match(mapper, /function handleMasterplanUploadInput/);
  assert.match(mapper, /input\.value = ""/);
  assert.match(mapper, /handleMasterplanUploadInput\(event\)/);
  assert.match(mapper, /upload\(event\.target\.files\[0\], "logo"\)/);
  assert.ok(mapper.includes("Preserve the existing upload path for logo/PDF/CAD/plot-sheet"));
});

test("Android image picker MIME quirks are normalized safely", () => {
  assert.match(mapper, /function normalizeMasterplanFile/);
  assert.match(mapper, /incomingType === "image\/jpg"/);
  assert.match(mapper, /incomingType === "application\/octet-stream"/);
  assert.match(route, /function imageUploadLooksValid/);
  assert.match(route, /IMAGE_EXTENSIONS\.has\(extension\)/);
});

test("HD processing caps mobile working canvases and releases memory", () => {
  assert.match(mapper, /MOBILE_MAPPING_DIMENSION = 4096/);
  assert.match(mapper, /MOBILE_MAPPING_PIXELS = 10_000_000/);
  assert.match(mapper, /canvas\.width = 1/);
  assert.match(mapper, /canvas\.height = 1/);
  assert.match(mapper, /bitmap\.close\(\)/);
});

test("mapped projects reject aspect-changing masterplan replacements", () => {
  assert.match(mapper, /hasMasterplan && mappedPlots\.length/);
  assert.match(mapper, /aspectDrift > 0\.0025/);
  assert.match(mapper, /Polygons safe rakhne ke liye upload block/);
});

test("masterplan upload has bounded network wait and clear failure stage", () => {
  assert.match(mapper, /MASTERPLAN_UPLOAD_TIMEOUT_MS = 120_000/);
  assert.match(mapper, /new AbortController\(\)/);
  assert.ok(mapper.includes('"Masterplan " + masterplanStage + " failed: "'));
});

test("masterplan replacement branch never mutates plot geometry or status", () => {
  const start = route.indexOf('\n    if (kind === "masterplan") {');
  const end = route.indexOf('\n    if (kind === "sourceCad") {', start);
  assert.ok(start >= 0 && end > start, "masterplan server branch not found");
  const branch = route.slice(start, end);
  assert.doesNotMatch(branch, /UPDATE\s+plots/i);
  assert.doesNotMatch(branch, /DELETE\s+FROM\s+plots/i);
  assert.doesNotMatch(branch, /savePlots\s*\(/);
  assert.match(branch, /deleteSettings\(projectId, \[/);
});

test("completed Tiyansh lock remains intact", () => {
  assert.match(mapper, /Tiyansh completed project locked/);
  assert.match(route, /Completed Tiyansh mapper locked/);
});
