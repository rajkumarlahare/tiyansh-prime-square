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

test("customer map exposes Google Maps open and driving directions actions", () => {
  assert.match(client, /function googleMapsLinks/);
  assert.match(client, /https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  assert.match(client, /https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
  assert.match(client, /travelmode=driving/);
  assert.match(client, /dir_action=navigate/);
  assert.match(client, /Open in Google Maps/);
  assert.match(client, /Directions/);
});

test("destination is derived from published masterplan WGS84 corners", () => {
  assert.match(client, /const corners = data\.masterplanCorners/);
  assert.match(client, /corners\.reduce\(\(sum, \[lng\]\) => sum \+ lng, 0\)/);
  assert.match(client, /corners\.reduce\(\(sum, \[, lat\]\) => sum \+ lat, 0\)/);
  assert.match(
    client,
    /const destination = encodeURIComponent\([\s\S]*lat\.toFixed\(7\)[\s\S]*lng\.toFixed\(7\)[\s\S]*\);/,
  );
});

test("navigation controls stay outside Google-owned DOM and above the map", () => {
  assert.match(css, /\.mapActions\s*\{[\s\S]*position:\s*absolute;/);
  assert.match(css, /\.mapActions\s*\{[\s\S]*z-index:\s*50;/);
  assert.match(css, /\.mapActions a\s*\{/);
  assert.match(client, /googleLinks && mapReady/);
  assert.match(client, /target="_blank"/);
  assert.match(client, /rel="noopener noreferrer"/);
});
