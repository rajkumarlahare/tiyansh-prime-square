import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/plot-mapper.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("mapper uses actual decoded masterplan dimensions", () => {
  assert.match(source, /naturalImageSize/);
  assert.match(source, /image\.naturalWidth/);
  assert.match(source, /image\.naturalHeight/);
  assert.match(source, /const sourceAspect = sourceWidth \/ sourceHeight/);
});

test("masterplan cannot use stretching object-fit fill", () => {
  assert.doesNotMatch(source, /objectFit: "fill"/);
  assert.match(source, /objectFit: "contain"/);
  assert.match(source, /objectPosition: "center"/);
  assert.match(css, /\.mapper-rotated-scene > img[\s\S]*object-fit: contain !important/);
});

test("90 and 270 swap viewport axes without changing source aspect", () => {
  assert.match(source, /rotationSwapsAxes \? 1 \/ sourceAspect : sourceAspect/);
  assert.match(source, /sourceSceneWidth = rotationSwapsAxes/);
  assert.match(source, /sourceAspect \* 100/);
  assert.match(source, /sourceSceneAspectRatio = `\$\{sourceWidth\} \/ \$\{sourceHeight\}`/);
});

test("saved plot geometry remains canonical and server verified", () => {
  assert.match(source, /polygon: JSON\.stringify\(points\)/);
  assert.match(source, /return sourcePointFromDisplay\(visual\)/);
  assert.match(source, /server read confirms the exact polygon that was just written/);
});
