import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/plot-mapper.tsx", import.meta.url),
  "utf8",
);

test("mapper provides real 90 degree portrait-landscape rotation controls", () => {
  assert.match(source, /const \[rotation, setRotation\] = useState<0 \| 1 \| 2 \| 3>\(0\)/);
  assert.match(source, /↺ 90°/);
  assert.match(source, /↻ 90°/);
  assert.match(source, /Rotate masterplan left 90 degrees/);
  assert.match(source, /Rotate masterplan right 90 degrees/);
  assert.doesNotMatch(source, /↔ Flip H/);
  assert.doesNotMatch(source, /↕ Flip V/);
});

test("quarter-turn visual transforms have exact inverse before save", () => {
  assert.match(source, /function displayPoint\(point: MapperPoint\)/);
  assert.match(source, /rotation === 1\) return \[1 - y, x\]/);
  assert.match(source, /rotation === 3\) return \[y, 1 - x\]/);
  assert.match(source, /function sourcePointFromDisplay\(point: MapperPoint\)/);
  assert.match(source, /rotation === 1\) return \[y, 1 - x\]/);
  assert.match(source, /rotation === 3\) return \[1 - y, x\]/);
  assert.match(source, /return sourcePointFromDisplay\(visual\)/);
});

test("rotated mapper swaps layout aspect ratio while overlays use same display coordinates", () => {
  assert.match(source, /rotationSwapsAxes/);
  assert.match(source, /aspectRatio: mapperAspectRatio/);
  assert.match(source, /rotate\(\$\{rotationDegrees\}deg\)/);
  assert.match(source, /const \[x, y\] = displayPoint\(point\)/);
  assert.match(source, /style=\{\{ left: `\$\{x \* 100\}%`, top: `\$\{y \* 100\}%` \}\}/);
});

test("rotation is device-project scoped and reset-safe", () => {
  assert.match(source, /rekixo:mapper-rotation:\$\{projectId\}/);
  assert.match(source, /setZoom\(1\)/);
  assert.match(source, /setRotation\(0\)/);
  assert.match(source, /Plot .*SERVER VERIFIED/);
});
