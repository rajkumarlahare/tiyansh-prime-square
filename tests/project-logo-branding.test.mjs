import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mapper = await readFile(new URL("../app/plot-mapper.tsx", import.meta.url), "utf8");
const superMapper = await readFile(new URL("../app/api/super-mapper/route.ts", import.meta.url), "utf8");
const asset = await readFile(new URL("../app/api/project-asset/[kind]/route.ts", import.meta.url), "utf8");
const publicData = await readFile(new URL("../app/api/public-data/route.ts", import.meta.url), "utf8");
const admin = await readFile(new URL("../app/admin-dashboard.tsx", import.meta.url), "utf8");
const site = await readFile(new URL("../public/project/index.html", import.meta.url), "utf8");

test("Super Admin mapper supports lightweight replaceable project logos", () => {
  assert.match(mapper, /async function prepareProjectLogo\(file: File\)/);
  assert.match(mapper, /maxSide = 512/);
  assert.match(mapper, /blob\.size <= 180 \* 1024/);
  assert.match(mapper, /"plotSheet" \| "logo"/);
  assert.match(mapper, /upload\(event\.target\.files\[0\], "logo"\)/);
  assert.match(mapper, /Project logo ready · tap to replace/);
});

test("logo upload is project-scoped, validated and versioned in R2", () => {
  assert.match(superMapper, /kind === "logo"/);
  assert.match(superMapper, /logo: 512 \* 1024/);
  assert.match(superMapper, /writeSetting\(projectId, "logoName"/);
  assert.match(superMapper, /writeSetting\(projectId, "logoVersion"/);
  assert.match(superMapper, /mapper\.logo_uploaded/);
});

test("customer website and Client Admin consume the same project logo", () => {
  assert.match(asset, /new Set\(\["masterplan", "logo"\]\)/);
  assert.match(publicData, /"logoName"/);
  assert.match(publicData, /"logoVersion"/);
  assert.match(admin, /className="client-project-logo"/);
  assert.match(admin, /\/api\/project-asset\/logo\?projectId=/);
  assert.match(site, /id="projectLogo"/);
  assert.match(site, /projectLogo\.src='\/api\/project-asset\/logo'/);
});

test("logo feature remains generic and is not hard-coded to one customer", () => {
  assert.doesNotMatch(admin, /9043e46a-faa7-4031-be89-bf268eac3c70/);
  assert.doesNotMatch(mapper, /9043e46a-faa7-4031-be89-bf268eac3c70/);
});
