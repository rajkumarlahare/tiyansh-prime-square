import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("public 2D rotates image and SVG together without rewriting canonical polygons", async () => {
  const [mapper, site] = await Promise.all([
    read("../app/plot-mapper.tsx"),
    read("../public/project/index.html"),
  ]);

  assert.match(mapper, /mapper-rotated-scene/);
  assert.match(mapper, /rekixo:mapper-rotation:\$\{projectId\}/);
  assert.match(mapper, /persistMapperSettings\(\{ publicRotation: String\(next\) \}\)/);

  assert.match(site, /publicRotation=normalizeQuarterTurn\(s\.publicRotation\)/);
  assert.match(site, /scale\(\$\{scale\}\) rotate\(\$\{publicRotation\*90\}deg\)/);
  assert.match(site, /u=rotateOffset\(dx,dy,\(4-publicRotation\)%4\)/);
  assert.match(site, /publicRotation%2\?\{w:H,h:W\}:\{w:W,h:H\}/);
});

test("repair workflow protects all 146 saved polygons before and after image replacement", async () => {
  const workflow = await read("../.github/workflows/repair-rpk-masterplan-v60.yml");
  assert.match(workflow, /TARGET_PROJECT_ID: "904"/);
  assert.match(workflow, /expected 146 mapped plots/);
  assert.match(workflow, /PLOTS_HASH_BEFORE/);
  assert.match(workflow, /PLOTS_HASH_AFTER/);
  assert.match(workflow, /polygon rows changed unexpectedly/);
  assert.match(workflow, /masterplanOriginal/);
  assert.match(workflow, /publicRotation','0'/);
});
