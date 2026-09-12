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
  assert.ok(a >= 0, "missing start anchor: " + start);
  assert.ok(b > a, "missing end anchor after " + start + ": " + end);
  return source.slice(a, b);
}

test("mobile panorama is decided by displayed aspect, not quarter-turn alone", () => {
  const helper = sliceBetween("function isMobilePanorama()", "function calcFit()");
  assert.match(helper, /const size=displaySize\(\)/);
  assert.match(helper, /const vw=viewportWidth\|\|viewport\.clientWidth/);
  assert.match(helper, /const vh=viewportHeight\|\|viewport\.clientHeight/);
  assert.match(helper, /size\.w\/Math\.max\(1,size\.h\)>vw\/Math\.max\(1,vh\)/);
  assert.doesNotMatch(helper, /publicRotation%2===1/);
});

test("mobile cover-fit removes side letterbox while desktop remains contain-fit", () => {
  assert.match(source, /fit = mobile \? Math\.max\(fw,fh\) : Math\.min\(fw,fh\)/);
  assert.match(source, /function initialPanForPresentation\(\)/);
  assert.match(source, /if\(!isMobilePanorama\(\)\)return\{x:0,y:0\}/);
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

test("framing helpers never mutate canonical polygon geometry", () => {
  const fitHelpers = sliceBetween("function isMobilePanorama()", "function limits()");
  const resetHelpers = sliceBetween("function initialPanForPresentation()", "function reset()");
  const presentationCode = fitHelpers + "\n" + resetHelpers;

  assert.doesNotMatch(
    presentationCode,
    /polygon|polyPoints|hotspots|getScreenCTM|matrixTransform|normalized|mapped\s*=|plot\.polygon/i,
  );
  assert.match(source, /const mapped=normalized\.map\(\(\[x,y\]\)=>\[x\*W,y\*H\]\)/);
});
