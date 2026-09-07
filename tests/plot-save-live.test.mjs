import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("mobile mapper blocks long-press browser selection and hides plot sidebar on coarse pointers", async () => {
  const [mapper, css] = await Promise.all([
    source("../app/plot-mapper.tsx"),
    source("../app/globals.css"),
  ]);
  assert.match(mapper, /onContextMenu=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(mapper, /enableSelectMode/);
  assert.match(mapper, /any-pointer: coarse/);
  assert.match(css, /Rekixo Plot Mapper V4\.1/);
  assert.match(css, /-webkit-touch-callout:\s*none/);
  assert.match(css, /@media \(any-pointer: coarse\), \(hover: none\)/);
  assert.match(css, /\.mapper-v4-work > \.mapper-review-list\s*\{[\s\S]*display:\s*none/);
});

test("each confirmed polygon is server-read-back verified before draft cleanup and next plot", async () => {
  const [mapper, api, publicData, publicSite] = await Promise.all([
    source("../app/plot-mapper.tsx"),
    source("../app/api/super-mapper/route.ts"),
    source("../app/api/public-data/route.ts"),
    source("../public/project/index.html"),
  ]);
  assert.match(mapper, /verifyPlotPersistence/);
  assert.match(mapper, /cache:\s*"no-store"/);
  assert.match(mapper, /SERVER VERIFIED/);
  const verifyPos = mapper.indexOf("verifyPlotPersistence(saved)");
  const cleanupPos = mapper.indexOf("localStorage.removeItem(mappingDraftKey(projectId, verified.plot.id))");
  const nextPos = mapper.indexOf("selectNextPlot(verified.plot.id)");
  assert.ok(verifyPos >= 0 && cleanupPos > verifyPos && nextPos > cleanupPos);
  assert.match(api, /await savePlots\(projectId, incoming\)/);
  assert.match(api, /cache-control": "no-store"/);
  assert.match(publicData, /from\(plots\)/);
  assert.match(publicData, /cache-control": "no-store"/);
  assert.match(publicSite, /fetch\('\/api\/public-data'[\s\S]*cache:'no-store'/);
});

test("RPK original 29.51 MB masterplan remains valid for future replacement", async () => {
  const [mapper, api] = await Promise.all([
    source("../app/plot-mapper.tsx"),
    source("../app/api/super-mapper/route.ts"),
  ]);
  assert.match(mapper, /MAX_ORIGINAL_MASTERPLAN_BYTES = 40 \* 1024 \* 1024/);
  assert.match(api, /originalFile\.size > 40 \* 1024 \* 1024/);
});
