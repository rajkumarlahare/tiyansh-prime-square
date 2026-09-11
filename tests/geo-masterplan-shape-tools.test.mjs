import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const editor = fs.readFileSync("app/masterplan-mask-editor.tsx", "utf8");
const css = fs.readFileSync("app/masterplan-mask-editor.module.css", "utf8");

test("shape tools add straight, wave and zigzag cut modes", () => {
  assert.match(editor, /type ShapeTool = "line" \| "wave" \| "zigzag";/);
  assert.match(editor, /Straight cut/);
  assert.match(editor, /Wave cut/);
  assert.match(editor, /Zigzag cut/);
  assert.match(editor, /function buildWavePoints\(/);
  assert.match(editor, /function buildZigzagPoints\(/);
});

test("shape tool preview overlay exists for dragged decorative cuts", () => {
  assert.match(editor, /shapeDraft/);
  assert.match(editor, /shapePreviewPoints/);
  assert.match(editor, /className=\{styles\.shapeOverlay\}/);
  assert.match(editor, /shapePolyline/);
});

test("existing safety guarantees remain intact", () => {
  assert.match(editor, /canvas\.width !== lockedSize\.width/);
  assert.match(editor, /canvas\.height !== lockedSize\.height/);
  assert.match(editor, /globalCompositeOperation = "destination-out"/);
  assert.match(editor, /PNG lossless/);
  assert.match(css, /\.shapeBar/);
  assert.match(css, /\.shapeOverlay/);
});
