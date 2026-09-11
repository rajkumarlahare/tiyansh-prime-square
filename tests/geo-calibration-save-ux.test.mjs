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

test("existing control points expose canonical saved state without adding another point", () => {
  assert.match(mapper, /savedControlPoints=\{state\.controlPoints \|\| \[\]\}/);
  assert.match(mapper, /calibrationDirty=\{calibrationDirty\}/);
  assert.match(visual, /function sameCalibrationPoint\(a: ControlPoint, b: ControlPoint\)/);
  assert.match(visual, /return sameCalibrationPoint\(point, savedPoint\) \? "saved" : "unsaved"/);
  assert.match(visual, /"Saved ✓"/);
});

test("save calibration action is visible beside the point workflow and does not depend on plus point", () => {
  assert.match(mapper, /onSaveCalibration=\{saveControlPoints\}/);
  assert.match(visual, /className=\{styles\.calibrationSaveButton\}/);
  assert.match(visual, /onClick=\{\(\) => void onSaveCalibration\(\)\}/);
  assert.match(visual, /disabled=\{disabled \|\| !calibrationDirty\}/);
  assert.match(visual, /`\+ Point` sirf naya control point banata hai/);
  assert.match(visual, /extra `\+ Point` banana zaroori nahi hai/);
});

test("plus point remains creation-only and bottom atomic save remains intact", () => {
  assert.match(mapper, /sourceSet: false, label: ""/);
  assert.match(mapper, /onClick=\{saveControlPoints\}/);
  assert.match(mapper, />\s*<Save \/> Save Calibration\s*<\/button>/);
});

test("saved and unsaved point states are visually distinct on desktop and mobile", () => {
  assert.match(css, /\.pointTabs button\.pointSaved \.pointSaveState/);
  assert.match(css, /\.pointTabs button\.pointUnsaved/);
  assert.match(css, /\.calibrationSaveBarDirty/);
  assert.match(css, /\.calibrationSaveBarSaved/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.calibrationSaveButton \{ width: 100%; \}/);
});
