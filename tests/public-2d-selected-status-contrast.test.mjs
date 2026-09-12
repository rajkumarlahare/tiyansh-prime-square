import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../public/project/index.html", import.meta.url), "utf8");

test("2D selected plot uses noticeable status-specific project tint without changing geometry", () => {
  assert.match(page, /REKIXO_PUBLIC_2D_SELECTED_STATUS_CONTRAST_V2/);
  assert.match(page, /\.plot\.selected\[data-status="available"\]\{fill:rgba\(var\(--plot-available-rgb\),\.36\)/);
  assert.match(page, /\.plot\.selected\[data-status="booked"\]\{fill:rgba\(var\(--plot-booked-rgb\),\.38\)/);
  assert.match(page, /\.plot\.selected\[data-status="sold"\]\{fill:rgba\(var\(--plot-sold-rgb\),\.38\)/);
  assert.match(page, /\.map\.dragging \.plot\.selected\[data-status\]\{filter:none\}/);
});

test("STATUS toggle cannot wash out the selected 2D plot", () => {
  assert.match(page, /\.show-all \.plot\.selected\[data-status="available"\][\s\S]*fill:rgba\(var\(--plot-available-rgb\),\.36\)/);
  assert.match(page, /\.show-all \.plot\.selected\[data-status="booked"\][\s\S]*fill:rgba\(var\(--plot-booked-rgb\),\.38\)/);
  assert.match(page, /\.show-all \.plot\.selected\[data-status="sold"\][\s\S]*fill:rgba\(var\(--plot-sold-rgb\),\.38\)/);
});

test("selected status contrast remains presentation-only", () => {
  assert.match(page, /function polyPoints\(p\)/);
  assert.match(page, /function setSelected\(id\)/);
  assert.match(page, /svg\.getScreenCTM\?\.\(\)/);
  assert.match(page, /matrixTransform\(ctm\.inverse\(\)\)/);
  assert.match(page, /const mapped=normalized\.map\(\(\[x,y\]\)=>\[x\*W,y\*H\]\)/);
  assert.match(page, /function openPlot\(p,focus=false\)/);
});
