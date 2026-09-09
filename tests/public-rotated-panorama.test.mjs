import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../public/project/index.html", import.meta.url),
  "utf8",
);

function sliceBetween(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0, `missing start anchor: ${start}`);
  assert.ok(b > a, `missing end anchor after ${start}: ${end}`);
  return source.slice(a, b);
}

test("quarter-turn mobile presentation becomes a left-anchored horizontal panorama", () => {
  assert.match(source, /function isMobilePanorama\(\)/);
  assert.match(source, /publicRotation%2===1/);
  assert.match(source, /fit = panorama \? fh : \(mobile \? fw : Math\.min\(fw,fh\)\)/);
  assert.match(source, /function initialPanForPresentation\(\)/);
  assert.match(source, /return\{x:l\.x,y:0\}/);
  assert.match(source, /pan=initialPanForPresentation\(\)/);
});

test("panorama still transforms image and clickable SVG as one immutable world", () => {
  assert.match(
    source,
    /world\.style\.transform = .*scale\(\$\{scale\}\) rotate\(\$\{publicRotation\*90\}deg\)/,
  );
  assert.match(source, /<img class="master"/);
  assert.match(source, /<svg class="hotspots" id="hotspots"/);
  assert.match(source, /svg\.getScreenCTM\?\.\(\)/);
  assert.match(source, /matrixTransform\(ctm\.inverse\(\)\)/);
});

test("panorama helpers are presentation-only and never touch canonical plot geometry", () => {
  const fitHelpers = sliceBetween("function isMobilePanorama()", "function limits()");
  const resetHelpers = sliceBetween("function initialPanForPresentation()", "function reset()");
  const presentationCode = `${fitHelpers}\n${resetHelpers}`;

  // Guard only the panorama helpers themselves. Do not scan the whole HTML from
  // publicRotation to the next unrelated polygon token; that creates false positives.
  assert.doesNotMatch(
    presentationCode,
    /polygon|polyPoints|hotspots|getScreenCTM|matrixTransform|normalized|mapped\s*=|plot\.polygon/i,
  );

  // Existing canonical conversion remains present elsewhere and untouched.
  assert.match(source, /const mapped=normalized\.map\(\(\[x,y\]\)=>\[x\*W,y\*H\]\)/);
});

test("even rotations preserve the existing mobile width-fit behavior", () => {
  assert.match(source, /fit = panorama \? fh : \(mobile \? fw : Math\.min\(fw,fh\)\)/);
  assert.match(source, /if\(!isMobilePanorama\(\)\)return\{x:0,y:0\}/);
});
