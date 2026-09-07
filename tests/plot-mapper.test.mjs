import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const source=path=>readFile(new URL(path,import.meta.url),"utf8");

test("plot mapper is owner-only and stores normalized project boundaries",async()=>{
  const [mapper,api,legacyApi,schema,website,clientAdmin,superAdmin]=await Promise.all([source("../app/plot-mapper.tsx"),source("../app/api/super-mapper/route.ts"),source("../app/api/mapper/route.ts"),source("../db/schema.ts"),source("../public/project/index.html"),source("../app/admin-dashboard.tsx"),source("../app/super-admin-dashboard.tsx")]);
  assert.match(mapper,/\(event\.clientX\s*-\s*box\.left\)\s*\/\s*box\.width/);
  assert.match(mapper,/mode\s*===\s*"rectangle"/);
  assert.match(mapper,/MAX_MASTERPLAN_BYTES/);
  assert.match(mapper,/createImageBitmap/);
  assert.match(mapper,/response\.status\s*===\s*413/);
  assert.match(mapper,/assetUrl\("sourcePdf"\)/);
  assert.match(mapper,/Block Auto: 4 taps/);
  assert.match(mapper,/function splitBlock/);
  assert.match(mapper,/plots: batch/);
  assert.match(api,/requireSuperAdmin/);
  assert.match(legacyApi,/status:403/);
  assert.match(api,/projects\/\$\{projectId\}\/mapper/);
  assert.match(api,/image\/jpeg/);
  assert.match(api,/application\/pdf/);
  assert.match(api,/mapper\.block_saved/);
  assert.match(api,/env\.DB\.batch/);
  assert.match(schema,/polygon:text\("polygon"\)/);
  assert.match(website,/row\.polygon/);
  assert.match(website,/project-asset\/masterplan/);
  assert.doesNotMatch(clientAdmin,/PlotMapper/);
  assert.match(superAdmin,/PlotMapper/);
  assert.match(superAdmin,/projectId=\{projectId\}/);
});
