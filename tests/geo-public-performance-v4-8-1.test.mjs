import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(
  new URL("../app/projects/[slug]/map/geo-public-map.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("../app/projects/[slug]/map/geo-public-map.module.css", import.meta.url),
  "utf8",
);

test("public map preconnects to Google Maps origins before data fetch", () => {
  assert.match(client, /function ensureGoogleMapsConnectionHints/);
  assert.match(client, /https:\/\/maps\.googleapis\.com/);
  assert.match(client, /https:\/\/maps\.gstatic\.com/);
  assert.match(
    client,
    /ensureGoogleMapsConnectionHints\(\);\s*const controller = new AbortController\(\);/,
  );
});

test("large masterplan texture is downscaled for mobile compositing without changing geo corners", () => {
  assert.match(client, /MOBILE_OVERLAY_MAX_DIMENSION = 2304/);
  assert.match(client, /DESKTOP_OVERLAY_MAX_DIMENSION = 3072/);
  assert.match(client, /document\.createElement\("canvas"\)/);
  assert.match(client, /context\.drawImage\(image, 0, 0, canvas\.width, canvas\.height\)/);
  assert.match(client, /cssProjectiveTransform\([\s\S]*surfaceWidth,[\s\S]*surfaceHeight/);
  assert.match(client, /corners\.map\(\(\[lng, lat\]\)/);
});

test("projective overlay draw work is capped to one animation frame", () => {
  assert.match(client, /let drawFrame: number \| null = null/);
  assert.match(client, /window\.requestAnimationFrame/);
  assert.match(client, /window\.cancelAnimationFrame/);
});

test("masterplan download yields priority to Google hybrid tiles on first load", () => {
  assert.match(client, /image\.fetchPriority = "low"/);
  assert.match(client, /image\.decoding = "async"/);
  assert.match(client, /mapTypeId: "hybrid"/);
  assert.match(client, /clickableIcons: true/);
});

test("canvas overlay keeps the same non-interactive styling as image overlay", () => {
  assert.match(css, /\.masterplanOverlay img,\s*\.masterplanOverlay canvas\s*\{/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /max-width:\s*none/);
});
