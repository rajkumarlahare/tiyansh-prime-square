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
const errorBoundary = readFileSync(
  new URL("../app/projects/[slug]/map/error.tsx", import.meta.url),
  "utf8",
);

test("public Google map is trapped inside its own stacking context", () => {
  assert.match(css, /\.shell\s*\{[\s\S]*isolation:\s*isolate;/);
  assert.match(css, /\.map\s*\{[\s\S]*z-index:\s*0;/);
  assert.match(css, /\.map\s*\{[\s\S]*isolation:\s*isolate;/);
  assert.match(css, /\.map\s*\{[\s\S]*background:\s*#07111e;/);
  assert.match(css, /\.header\s*\{[\s\S]*z-index:\s*50;/);
  assert.match(css, /\.loading,[\s\S]*\.error\s*\{[\s\S]*z-index:\s*60;/);
});

test("loading stays visible until Google satellite tiles really load", () => {
  assert.match(client, /const \[mapReady, setMapReady\] = useState\(false\)/);
  assert.match(client, /map\.addListener\("tilesloaded"/);
  assert.match(client, /setMapReady\(true\)/);
  assert.match(client, /!error && \(!data \|\| !mapReady\)/);
  assert.match(client, /Google Satellite tiles load ho rahe hain/);
});

test("public Geo payload is validated before React renders it", () => {
  assert.match(client, /function validatePublicGeoData/);
  assert.match(client, /Satellite map data incomplete hai/);
  assert.match(client, /return validatePublicGeoData\(payload\)/);
});

test("Maps authorization and stalled tiles surface an error instead of blank white UI", () => {
  assert.match(client, /gm_authFailure/);
  assert.match(client, /Google Maps API key\/referrer authorization fail hui/);
  assert.match(client, /Satellite tiles 20 sec me load nahi hue/);
});

test("route-level runtime errors keep a visible dark recovery screen", () => {
  assert.match(errorBoundary, /"use client"/);
  assert.match(errorBoundary, /Satellite Map runtime error/);
  assert.match(errorBoundary, /background:\s*"#06101d"/);
  assert.match(errorBoundary, /reset\(\)/);
});
