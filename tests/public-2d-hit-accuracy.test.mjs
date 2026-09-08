import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(
  new URL("../public/project/index.html", import.meta.url),
  "utf8",
);

test("public quarter-turn helper matches CSS clockwise rotation", () => {
  const match = source.match(
    /function rotateOffset\(x,y,turns\)\{[\s\S]*?\n  \}/,
  );
  assert.ok(match, "rotateOffset helper missing");
  const rotate = vm.runInNewContext(
    "(()=>{" + match[0] + ";return (x,y,t)=>rotateOffset(x,y,t)})()",
  );
  assert.equal(JSON.stringify(rotate(10, 20, 0)), JSON.stringify({ x: 10, y: 20 }));
  assert.equal(JSON.stringify(rotate(10, 20, 1)), JSON.stringify({ x: -20, y: 10 }));
  assert.equal(JSON.stringify(rotate(10, 20, 2)), JSON.stringify({ x: -10, y: -20 }));
  assert.equal(JSON.stringify(rotate(10, 20, 3)), JSON.stringify({ x: 20, y: -10 }));
  for (let turn = 0; turn < 4; turn += 1) {
    const a = rotate(137, -52, turn);
    const b = rotate(a.x, a.y, (4 - turn) % 4);
    assert.equal(Math.round(b.x), 137);
    assert.equal(Math.round(b.y), -52);
  }
});

test("2D tap conversion follows the rendered SVG matrix", () => {
  assert.match(source, /svg\.getScreenCTM\?\.\(\)/);
  assert.match(source, /svg\.createSVGPoint\(\)/);
  assert.match(source, /matrixTransform\(ctm\.inverse\(\)\)/);
  assert.match(source, /document\.elementFromPoint\(x,y\)/);
  assert.match(source, /const native=nativePlotAtClient\(x,y\)/);
});

test("touch hit fallback cannot jump broadly across neighbouring plots", () => {
  assert.match(source, /HIT_PAD = e => isCoarse\(e\) \? 5 : 2/);
  assert.match(source, /hit=startHit\|\|releaseHit/);
});

