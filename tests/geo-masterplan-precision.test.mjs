import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mapper = readFileSync(
  new URL("../app/geo-mapper.tsx", import.meta.url),
  "utf8",
);
const visual = readFileSync(
  new URL("../app/geo-visual-calibration.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("../app/geo-visual-calibration.module.css", import.meta.url),
  "utf8",
);

test("new control points stay visually unplaced until the masterplan is tapped", () => {
  assert.match(mapper, /sourceSet\?: boolean/);
  assert.match(mapper, /sourceSet: false/);
  assert.match(visual, /function hasPlacedSource\(point: ControlPoint\)/);
  assert.match(visual, /sourceSet: true/);
  assert.match(visual, /hasPlacedSource\(point\) \? \(/);
});

test("newly added control point becomes active automatically", () => {
  assert.match(visual, /knownPointIdsRef/);
  assert.match(visual, /const addedPoint = controlPoints\.find/);
  assert.match(visual, /setActiveId\(addedPoint\.id\)/);
  assert.match(visual, /setMasterplanTool\("point"\)/);
});

test("masterplan image and source markers share one transformed coordinate canvas", () => {
  assert.match(visual, /className=\{styles\.masterplanCanvas\}/);
  assert.match(
    visual,
    /translate3d\(\$\{masterplanPan\.x\}px, \$\{masterplanPan\.y\}px, 0\) scale\(\$\{masterplanZoom\}\)/,
  );
  assert.match(visual, /onWheel=\{zoomMasterplanWithWheel\}/);
  assert.match(visual, /onPointerDown=\{beginMasterplanPan\}/);
  assert.match(visual, /onPointerMove=\{moveMasterplanPan\}/);
  assert.match(css, /\.masterplanCanvas\s*\{[\s\S]*position:\s*relative;/);
  assert.match(css, /\.masterplanCanvas img\s*\{[\s\S]*width:\s*100%;[\s\S]*height:\s*auto;/);
});

test("masterplan precision controls include point placement pan zoom and fit", () => {
  assert.match(visual, />\s*Place point\s*</);
  assert.match(visual, />\s*Pan\s*</);
  assert.match(visual, /Zoom masterplan in/);
  assert.match(visual, /Zoom masterplan out/);
  assert.match(visual, />\s*Fit\s*</);
});

test("source marker is small constant-screen-size and never blocks a precise tap", () => {
  assert.match(
    css,
    /\.sourceMarker\s*\{[\s\S]*width:\s*12px;[\s\S]*height:\s*12px;[\s\S]*pointer-events:\s*none;/,
  );
  assert.match(visual, /scale\(\$\{1 \/ masterplanZoom\}\)/);
});

test("precision controls remain isolated from stable Plot Mapper and public APIs", () => {
  assert.doesNotMatch(visual, /\/api\/super-mapper/);
  assert.doesNotMatch(visual, /\/api\/admin\/plots/);
  assert.doesNotMatch(visual, /\/api\/admin\/publish/);
});
