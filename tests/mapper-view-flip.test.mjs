import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/plot-mapper.tsx", import.meta.url),
  "utf8",
);

test("mapper provides horizontal and vertical view-only flips", () => {
  assert.match(source, /const \[flipX, setFlipX\] = useState\(false\)/);
  assert.match(source, /const \[flipY, setFlipY\] = useState\(false\)/);
  assert.match(source, /↔ Flip H/);
  assert.match(source, /↕ Flip V/);
  assert.match(source, /Horizontal flip — mapping view only/);
  assert.match(source, /Vertical flip — mapping view only/);
});

test("visual flips invert pointer coordinates before persistent geometry save", () => {
  assert.match(source, /function displayPoint\(point: MapperPoint\)/);
  assert.match(source, /flipX \? 1 - point\[0\] : point\[0\]/);
  assert.match(source, /flipY \? 1 - point\[1\] : point\[1\]/);
  assert.match(source, /return displayPoint\(visual\)/);
  assert.match(source, /Plot .*SERVER VERIFIED/);
});

test("image, polygon overlays and draggable handles share the flipped visual space", () => {
  assert.match(source, /scaleX\(\$\{flipX \? -1 : 1\}\)/);
  assert.match(source, /polygon\.map\(\(point\) => \{/);
  assert.match(source, /points\.map\(\(point, index\) => \{/);
  assert.match(source, /const \[x, y\] = displayPoint\(point\)/);
});
