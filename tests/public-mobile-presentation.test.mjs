import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../public/project/index.html", import.meta.url),
  "utf8",
);

test("mobile presentation cover-fits from final displayed geometry", () => {
  assert.match(source, /function isMobilePanorama\(\)/);
  assert.match(source, /const size=displaySize\(\)/);
  assert.match(source, /return size\.w\/Math\.max\(1,size\.h\)>vw\/Math\.max\(1,vh\)/);
  assert.match(source, /fit = mobile \? Math\.max\(fw,fh\) : Math\.min\(fw,fh\)/);
  assert.match(source, /<svg class="hotspots" id="hotspots"/);
  assert.doesNotMatch(source, /<svg class="hotspots show-all"/);
});

test("mobile controls use safe shared HUD gutters", () => {
  assert.match(source, /--rekixo-hud-right:max\(14px,env\(safe-area-inset-right,0px\)\)/);
  assert.match(source, /--rekixo-hud-bottom:max\(14px,env\(safe-area-inset-bottom,0px\)\)/);
  assert.match(source, /--rekixo-hud-control-size:38px/);
  assert.match(source, /--rekixo-hud-column-gap:10px/);
  assert.match(source, /\.mini-logo\{right:var\(--rekixo-hud-right\)\}/);
  assert.match(source, /\.controls\{right:var\(--rekixo-hud-right\);bottom:var\(--rekixo-hud-bottom\)\}/);
  assert.match(source, /\.bottom-links\{right:calc\(var\(--rekixo-hud-right\) \+ var\(--rekixo-hud-control-size\) \+ var\(--rekixo-hud-column-gap\)\);bottom:var\(--rekixo-hud-bottom\)\}/);
  assert.match(source, /let selected = null, showAll = false, statusExpanded = true/);
  assert.match(source, /<div class="status expanded" id="statusCard">/);
  assert.match(source, /class="toggle" id="outlineToggle"/);
  assert.match(source, /aria-label="Toggle plot boundaries" aria-pressed="false"/);
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
