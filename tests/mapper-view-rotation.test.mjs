import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/plot-mapper.tsx", import.meta.url),
  "utf8",
);
const css = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("90 degree mapper uses actual image aspect for full contain-fit inside capped canvas", () => {
  assert.match(source, /const sourceAspect = sourceWidth \/ sourceHeight/);
  assert.match(source, /const visualAspect = rotationSwapsAxes \? 1 \/ sourceAspect : sourceAspect/);
  assert.match(source, /zoom \* 58 \* visualAspect/);
  assert.match(source, /width: mapperViewportWidth/);
  assert.match(source, /aspectRatio: mapperAspectRatio/);
  assert.match(source, /marginInline: "auto"/);
  assert.match(source, /sourceSceneAspectRatio = `\$\{sourceWidth\} \/ \$\{sourceHeight\}`/);
  assert.doesNotMatch(source, /objectFit: "fill"/);
  assert.match(source, /objectFit: "contain"/);
});

test("image, saved SVG, draft, CAD and handles live in ONE rotated source scene", () => {
  assert.match(source, /className="mapper-rotated-scene"/);
  assert.match(source, /data-rotation=\{rotationDegrees\}/);
  assert.match(source, /width: sourceSceneWidth/);
  assert.match(source, /aspectRatio: sourceSceneAspectRatio/);
  assert.match(source, /translate\(-50%, -50%\) rotate\(\$\{rotationDegrees\}deg\)/);
  assert.match(source, /polygon\.map\(\(\[x, y\]\) => `\$\{x \* 1000\},\$\{y \* 1000\}`\)/);
  assert.match(source, /points\.map\(\(\[x, y\], index\) =>/);
  assert.match(css, /\.mapper-rotated-scene > svg/);
});

test("saved polygon is never visually re-authored during rotation", () => {
  assert.doesNotMatch(source, /function displayPoint/);
  assert.match(source, /polygon: JSON\.stringify\(points\)/);
  assert.match(source, /Plot \$\{verified\.plot\.id\} SERVER VERIFIED/);
  assert.match(source, /server read confirms the exact polygon that was just written/);
});

test("rotated taps invert back to canonical original-image coordinates", () => {
  assert.match(source, /function sourcePointFromDisplay\(point: MapperPoint\)/);
  assert.match(source, /rotation === 1\) return \[y, 1 - x\]/);
  assert.match(source, /rotation === 2\) return \[1 - x, 1 - y\]/);
  assert.match(source, /rotation === 3\) return \[1 - y, x\]/);
  assert.match(source, /return sourcePointFromDisplay\(visual\)/);
});

test("snapping swaps rendered source axes at quarter-turn rotations", () => {
  assert.match(source, /sourceRenderedWidth = rotation === 1 \|\| rotation === 3 \? box\.height : box\.width/);
  assert.match(source, /sourceRenderedHeight = rotation === 1 \|\| rotation === 3 \? box\.width : box\.height/);
  assert.match(source, /const snapThresholdPx = Math\.max/);
  assert.match(source, /18 \/ Math\.sqrt\(Math\.max\(1, zoomRef\.current\)\)/);
  assert.match(source, /snapPoint\(\s*raw,\s*mappedPolygons,\s*sourceRenderedWidth,\s*sourceRenderedHeight,\s*snapThresholdPx,\s*\)/s);
});

test("rotation remains project-device scoped, reset-safe and never controls website geometry", () => {
  assert.match(source, /rekixo:mapper-rotation:\$\{projectId\}/);
  assert.match(source, /↺ 90°/);
  assert.match(source, /↻ 90°/);
  assert.match(source, /setZoom\(1\)/);
  assert.match(source, /setRotation\(0\)/);
  assert.doesNotMatch(source, /persistMapperSettings\(\{ publicRotation:/);
  assert.match(source, /Mapper view:/);
});
