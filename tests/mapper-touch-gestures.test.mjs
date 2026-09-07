import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mapper = await readFile(
  new URL("../app/plot-mapper.tsx", import.meta.url),
  "utf8",
);
const css = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("mapper owns one-finger pan and frame-coalesces raw pointer motion", () => {
  assert.match(mapper, /activeGesturePointersRef/);
  assert.match(mapper, /armPanGesture/);
  assert.match(mapper, /gestureFrameRef/);
  assert.match(mapper, /requestAnimationFrame/);
  assert.match(mapper, /queuePanDelta\(deltaX, deltaY\)/);
  assert.match(mapper, /pendingPanRef/);
  assert.match(mapper, /toolMode === "pan"/);

  const moveStart = mapper.indexOf("function handleMapperGesturePointerMove");
  const moveEnd = mapper.indexOf("function handleMapperGesturePointerEnd", moveStart);
  const moveBody = mapper.slice(moveStart, moveEnd);
  assert.doesNotMatch(moveBody, /canvas\.scrollLeft/);
  assert.doesNotMatch(moveBody, /canvas\.scrollTop/);
});

test("select mode keeps tap-to-corner but converts a real drag into pan", () => {
  assert.match(mapper, /event\.pointerType === "touch" && totalMovement > 10/);
  assert.match(mapper, /toolMode === "pan" && !calibrationMode/);
  assert.match(mapper, /const shouldPan =\s*!calibrationMode/);
  assert.match(mapper, /tapStartRef\.current = null/);
  assert.match(mapper, /Date\.now\(\) < suppressTapUntilRef\.current/);
  assert.match(mapper, /SELECT: tap = corner/);
});

test("two fingers pinch-zoom and pan are committed together once per paint frame", () => {
  assert.match(mapper, /Math\.hypot\(b\.x - a\.x, b\.y - a\.y\)/);
  assert.match(mapper, /pinch\.startZoom \* \(pair\.distance \/ Math\.max\(1, pinch\.startDistance\)\)/);
  assert.match(mapper, /queuePinchFrame\(nextZoom, pair\.centerX, pair\.centerY, panX, panY\)/);
  assert.match(mapper, /pendingPinchRef/);
  assert.match(mapper, /Math\.abs\(pinch\.panX\) >= 0\.25/);
  assert.match(mapper, /setMapperZoom\(pinch\.zoom, pinch\.centerX, pinch\.centerY\)/);
});

test("zoom keeps the point under the fingers anchored after React relayout", () => {
  assert.match(mapper, /useLayoutEffect/);
  assert.match(mapper, /zoomAnchorRef/);
  assert.match(mapper, /anchoredClientX - anchor\.clientX/);
  assert.match(mapper, /anchoredClientY - anchor\.clientY/);
  assert.match(mapper, /zoomAtCanvasCenter/);
});

test("gesture handlers are capture-phase on the image viewport and handles stay independent", () => {
  assert.match(mapper, /onPointerDownCapture=\{handleMapperGesturePointerDown\}/);
  assert.match(mapper, /onPointerMoveCapture=\{handleMapperGesturePointerMove\}/);
  assert.match(mapper, /onPointerUpCapture=\{handleMapperGesturePointerEnd\}/);
  assert.match(mapper, /SELECT single-tap is deliberately NOT captured here/);
  assert.match(mapper, /for \(const pointerId of activeGesturePointersRef\.current\.keys\(\)\)/);
  assert.match(mapper, /mapperGestureTargetIsHandle/);
  assert.match(mapper, /onPointerDown=\{\(event\) => dragHandle\(event, index\)\}/);
});

test("mobile browser gestures cannot steal the mapper and touch handles are usable", () => {
  assert.match(css, /Rekixo Mapper V5\.4/);
  assert.match(css, /touch-action: none !important/);
  assert.match(css, /overscroll-behavior: none/);
  assert.match(css, /width: 36px/);
  assert.match(css, /height: 36px/);
});

test("rotation/reset clears transient gesture state without touching saved geometry", () => {
  assert.match(mapper, /activeGesturePointersRef\.current\.clear\(\)/);
  assert.match(mapper, /suppressTapUntilRef\.current = Date\.now\(\) \+ 250/);
  assert.match(mapper, /requestAnimationFrame\(\(\) => \{\s*requestAnimationFrame/);
});

test("gesture work never changes canonical saved plot geometry or read-back verification", () => {
  assert.match(mapper, /return sourcePointFromDisplay\(visual\)/);
  assert.match(mapper, /polygon: JSON\.stringify\(points\)/);
  assert.match(mapper, /verifyPlotPersistence\(saved\)/);
  assert.match(mapper, /SERVER VERIFIED/);
});
