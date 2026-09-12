import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publicMap = readFileSync(
  new URL("../app/projects/[slug]/map/geo-public-map.tsx", import.meta.url),
  "utf8",
);
const adminVisual = readFileSync(
  new URL("../app/geo-visual-calibration.tsx", import.meta.url),
  "utf8",
);
const errorBoundary = readFileSync(
  new URL("../app/projects/[slug]/map/error.tsx", import.meta.url),
  "utf8",
);

test("public masterplan OverlayView draw is guarded like stable admin overlay", () => {
  assert.match(adminVisual, /const draw = \(\) => \{[\s\S]*try \{[\s\S]*solveHomography\(/);
  assert.match(
    publicMap,
    /const draw = \(\) => \{[\s\S]*try \{[\s\S]*solveHomography\([\s\S]*\} catch \(error\) \{[\s\S]*host\.style\.visibility = "hidden"/,
  );
});

test("public overlay never lets transient projection/homography failure crash route", () => {
  assert.match(publicMap, /Public masterplan overlay draw skipped/);
  assert.match(publicMap, /if \(!projection\) return/);
  assert.match(publicMap, /if \(!panes\?\.overlayLayer\)/);
  assert.match(publicMap, /image\.onerror = \(\) => \{/);
});

test("route runtime fallback now exposes the concrete browser error for diagnosis", () => {
  assert.match(errorBoundary, /error\.message/);
  assert.match(errorBoundary, /Technical detail:/);
});
