import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const visual = readFileSync(
  new URL("../app/geo-visual-calibration.tsx", import.meta.url),
  "utf8",
);

test("Fine Align keeps the masterplan overlay node persistent", () => {
  assert.match(visual, /REKIXO_GEO_FINE_ALIGN_SMOOTH_V3_1/);
  assert.match(visual, /masterplanOverlayDrawRef/);
  assert.match(visual, /fineAlignmentRef\.current/);
  assert.match(visual, /overlayOpacityRef\.current/);
  assert.match(
    visual,
    /mapReady,\s*overlayMasterplanUrl,\s*previewCalibration,\s*showMasterplanOverlay,/s,
  );
});

test("Fine Align updates existing Google polygons in place", () => {
  assert.match(visual, /mapPlotPolygonEntriesRef/);
  assert.match(visual, /polygon\.setPath\(/);
  assert.match(visual, /entries\.push\(\{ polygon, rawPath \}\)/);
  assert.match(
    visual,
    /One paint-cycle update: image transform \+ all existing plot paths move together/,
  );
});

test("Fine Align finger drag is coalesced to animation frames", () => {
  assert.match(visual, /fineAlignDragFrameRef/);
  assert.match(visual, /fineAlignDragPendingRef/);
  assert.match(visual, /window\.requestAnimationFrame\(/);
  assert.match(visual, /clearQueuedFineAlignDrag\(true\)/);
});

test("Fine Align still keeps straight metric values in parent state", () => {
  assert.match(
    visual,
    /eastMeters: gesture\.origin\.eastMeters \+ dx \* gesture\.metersPerPixel/,
  );
  assert.match(
    visual,
    /northMeters: gesture\.origin\.northMeters - dy \* gesture\.metersPerPixel/,
  );
  assert.match(visual, /normalizeGeoFineAlignment\(/);
});
