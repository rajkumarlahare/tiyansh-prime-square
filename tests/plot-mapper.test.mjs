import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("guided mapper is owner-only and publishes normalized clickable 2D/3D plots", async () => {
  const [mapper, api, legacyApi, schema, website, three, clientAdmin, superAdmin] =
    await Promise.all([
      source("../app/plot-mapper.tsx"),
      source("../app/api/super-mapper/route.ts"),
      source("../app/api/mapper/route.ts"),
      source("../db/schema.ts"),
      source("../public/project/index.html"),
      source("../public/project/three-view.js"),
      source("../app/admin-dashboard.tsx"),
      source("../app/super-admin-dashboard.tsx"),
    ]);

  assert.match(mapper, /\(event\.clientX\s*-\s*box\.left\)\s*\/\s*box\.width/);
  assert.match(mapper, /shape === "rectangle"/);
  assert.match(mapper, /phase.*"select".*"details"/s);
  assert.match(mapper, /Confirm .*start next/);
  assert.match(mapper, /nextPlotId/);
  assert.match(mapper, /normalizeMasterplan/);
  assert.match(mapper, /MAP_WIDTH = 1200/);
  assert.match(mapper, /MAP_HEIGHT = 2133/);
  assert.match(mapper, /createImageBitmap/);
  assert.match(mapper, /context\.drawImage/);
  assert.match(mapper, /assetUrl\("sourcePdf"\)/);
  assert.match(mapper, /Move image/);
  assert.match(mapper, /Tiyansh masterplan locked/);
  assert.match(mapper, /onPointerDown=\{navigate \? undefined : mapPoint\}/);

  assert.match(api, /requireSuperAdmin/);
  assert.match(legacyApi, /status:403/);
  assert.match(api, /projects\/\$\{projectId\}\/mapper/);
  assert.match(api, /application\/pdf/);
  assert.match(api, /env\.DB\.batch/);
  assert.match(api, /Completed Tiyansh masterplan locked/);
  assert.match(schema, /polygon:text\("polygon"\)/);

  assert.match(website, /row\.polygon/);
  assert.match(website, /if\(!isTiyansh\)/);
  assert.match(website, /plots\.splice\(0,plots\.length\)/);
  assert.match(website, /project-asset\/masterplan/);
  assert.match(website, /setImageSrc/);
  assert.match(website, /PUBLIC_READY = false, HAS_MASTERPLAN = false/);
  assert.match(website, /world\.style\.visibility = 'hidden'/);
  assert.match(website, /Masterplan upload hone ke baad 3D ready hoga/);
  assert.match(three, /this\.imageSrc=opt\.imageSrc/);
  assert.match(three, /setPlots\(plots\)/);
  assert.match(three, /setImageSrc\(src\)/);

  assert.doesNotMatch(clientAdmin, /PlotMapper/);
  assert.match(clientAdmin, /isTiyansh\?\(plotInventory as Plot\[\]\):\[\]/);
  assert.match(superAdmin, /PlotMapper/);
  assert.match(superAdmin, /projectId=\{projectId\}/);
});
