import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(
  new URL("../public/project/index.html", import.meta.url),
  "utf8",
);

test("status options stay permanently visible while plot boundaries default OFF", () => {
  assert.match(html, /<div class="status expanded" id="statusCard">/);
  assert.match(
    html,
    /class="toggle" id="outlineToggle" aria-label="Toggle plot boundaries" aria-pressed="false"/,
  );
  assert.match(html, /<svg class="hotspots" id="hotspots"/);
  assert.doesNotMatch(html, /<svg class="hotspots show-all" id="hotspots"/);
  assert.match(
    html,
    /let selected = null, showAll = false, statusExpanded = true, statusFilter = null;/,
  );
  assert.doesNotMatch(html, /statusCard\.classList\.toggle\('expanded'/);
});

test("status toggle changes only boundary visibility and keeps 2D plus 3D synced", () => {
  assert.match(html, /function toggleStatusPanel\(\)\{toggleBoundaries\(\)\}/);
  assert.match(html, /function syncBoundaryToggle\(\)/);
  assert.match(html, /svg\.classList\.toggle\('show-all',showAll\)/);
  assert.match(html, /engine3D\?\.setShowAll\(showAll\)/);
});

test("status filters are gated by show-all", () => {
  assert.match(
    html,
    /\.show-all\.status-filter-available \.plot\[data-status="available"\]/,
  );
  assert.match(
    html,
    /\.show-all\.status-filter-booked \.plot\[data-status="booked"\]/,
  );
  assert.match(
    html,
    /\.show-all\.status-filter-sold \.plot\[data-status="sold"\]/,
  );
});

test("Gallery and Location width trim preserves button heights", () => {
  assert.match(html, /\.pill\{width:114\.5px;height:40px/);
  const mobile = html.match(/\.pill\{width:144\.5px;height:49px/g) || [];
  assert.equal(mobile.length, 2);
});
