import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const calibration = fs.readFileSync("app/geo-visual-calibration.tsx", "utf8");
const editor = fs.readFileSync("app/masterplan-mask-editor.tsx", "utf8");
const css = fs.readFileSync("app/masterplan-mask-editor.module.css", "utf8");

test("Geo calibration mounts the non-destructive masterplan mask editor", () => {
  assert.match(calibration, /import MasterplanMaskEditor from "\.\/masterplan-mask-editor";/);
  assert.match(calibration, /maskedMasterplanPreviewUrl/);
  assert.match(calibration, /overlayMasterplanUrl/);
  assert.match(calibration, /<MasterplanMaskEditor/);
  assert.match(calibration, /onPreviewChange=\{setMaskedMasterplanPreviewUrl\}/);
});

test("satellite overlay consumes masked preview without changing source calibration image", () => {
  assert.match(calibration, /image\.src = overlayMasterplanUrl;/);
  assert.match(calibration, /src=\{masterplanUrl\}/);
});

test("mask editor preserves the intrinsic canvas dimensions and uses alpha masking", () => {
  assert.match(editor, /canvas\.width = width;/);
  assert.match(editor, /canvas\.height = height;/);
  assert.match(editor, /canvas\.width !== lockedSize\.width/);
  assert.match(editor, /globalCompositeOperation = "destination-out"/);
  assert.match(editor, /globalCompositeOperation = "destination-in"/);
  assert.doesNotMatch(editor, /drawImage\([^)]*,\s*0,\s*0,\s*[^,]+,\s*[^,]+,\s*0,\s*0,\s*[^,]+,\s*[^)]+\)/);
});

test("lossless PNG export and transparent preview are available", () => {
  assert.match(editor, /exportBlob\("image\/png"\)/);
  assert.match(editor, /PNG lossless/);
  assert.match(editor, /URL\.createObjectURL\(blob\)/);
  assert.match(css, /background-image:/);
});

test("replacement masterplan cannot silently change the locked pixel canvas", () => {
  assert.match(editor, /width !== expected\.width \|\| height !== expected\.height/);
  assert.match(editor, /Locked canvas/);
});
