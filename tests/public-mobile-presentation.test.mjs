import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../public/project/index.html", import.meta.url),
  "utf8",
);

test("mobile map width-fit keeps image and polygons together", () => {
  assert.match(source, /fit = mobile \? fw : Math\.min\(fw,fh\)/);
  assert.match(source, /<svg class="hotspots show-all"/);
});

test("mobile controls use requested defaults", () => {
  assert.match(source, /\.bottom-links\{right:51px;bottom:14px\}/);
  assert.match(source, /let selected = null, showAll = true, statusExpanded = true/);
  assert.match(source, /<div class="status expanded" id="statusCard">/);
  assert.match(source, /class="toggle on" id="outlineToggle"/);
});

test("project header prefers address under title", () => {
  assert.match(
    source,
    /const resolvedAddress=String\(s\.address\|\|resolvedLocation\)\.trim\(\)/,
  );
  assert.match(
    source,
    /location\.textContent=\(resolvedAddress\|\|PROJECT_LOCATION\)\.toUpperCase\(\)/,
  );
});
