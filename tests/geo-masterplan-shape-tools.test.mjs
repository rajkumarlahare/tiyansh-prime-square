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


test("wave and zigzag amplitudes are reduced for tighter decorative cuts", () => {
  assert.match(editor, /const WAVE_AMPLITUDE_SCALE = 0\.255;/);
  assert.match(editor, /const ZIGZAG_AMPLITUDE_SCALE = 0\.255;/);
  assert.match(editor, /brushSize \* 0\.9 \* WAVE_AMPLITUDE_SCALE/);
  assert.match(editor, /distance \* 0\.1 \* WAVE_AMPLITUDE_SCALE/);
  assert.match(editor, /brushSize \* 0\.85 \* ZIGZAG_AMPLITUDE_SCALE/);
  assert.match(editor, /distance \* 0\.09 \* ZIGZAG_AMPLITUDE_SCALE/);
});


test("wave and zigzag final cut thickness matches their live preview while straight stays unchanged", () => {
  assert.match(editor, /const DECORATIVE_CUT_WIDTH_SCALE = 1\.8;/);
  assert.match(editor, /function decorativeCutSize\(shapeTool: ShapeTool\)/);
  assert.match(editor, /shapeTool === "line" \? brushSize : brushSize \* DECORATIVE_CUT_WIDTH_SCALE/);
  assert.match(editor, /drawPointSeries\([\s\S]*decorativeCutSize\(shapeTool\)/);
  assert.match(editor, /const shapePreviewWidth = shapeDraft/);
  assert.match(editor, /strokeWidth=\{shapePreviewWidth\}/);
  assert.match(editor, /vectorEffect=\{shapeDraft\.tool === "line" \? "non-scaling-stroke" : undefined\}/);
});
