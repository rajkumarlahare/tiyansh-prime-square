import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../public/project/index.html", import.meta.url), "utf8");

function cssPx(name) {
  const match = page.match(new RegExp(`--${name}:([0-9.]+)px`));
  assert.ok(match, `missing CSS token --${name}`);
  return Number(match[1]);
}

test("Gallery and Location buttons are exactly 30 percent narrower than audited baselines", () => {
  const desktopBaseline = 114.5;
  const mobileBaseline = 144.5;

  assert.equal(cssPx("action-pill-width"), 80.15);
  assert.equal(cssPx("action-pill-mobile-width"), 101.15);
  assert.ok(Math.abs(cssPx("action-pill-width") - desktopBaseline * 0.70) < 0.001);
  assert.ok(Math.abs(cssPx("action-pill-mobile-width") - mobileBaseline * 0.70) < 0.001);

  assert.match(
    page,
    /\.pill\{width:var\(--action-pill-width\);height:40px;padding:0 6px/,
  );

  const mobile = page.match(
    /\.pill\{width:var\(--action-pill-mobile-width\);height:49px;padding:0 8px;border-radius:14px;font-size:9\.6px;gap:5px/g,
  ) || [];
  assert.equal(mobile.length, 2);

  // Negative assertions intentionally mention the OLD widths.
  // They prove the legacy literal CSS declarations are gone.
  assert.doesNotMatch(page, /\.pill\{width:114\.5px/);
  assert.doesNotMatch(page, /\.pill\{width:144\.5px/);
});

test("button heights, ids and icons remain unchanged", () => {
  assert.match(page, /id="galleryBtn"/);
  assert.match(page, /id="locationBtn"/);
  assert.match(page, /\.pill \.pin\{width:14px;height:17px/);
  assert.match(page, /\.pill \.gallery\{width:14px;height:14px/);
  assert.match(page, /height:40px/);
  assert.match(page, /height:49px/);
});

test("trim remains presentation-only and preserves map interaction anchors", () => {
  assert.match(page, /function pointInPolygon/);
  assert.match(page, /svg\.getScreenCTM\?\.\(\)/);
  assert.match(page, /matrixTransform\(ctm\.inverse\(\)\)/);
});
