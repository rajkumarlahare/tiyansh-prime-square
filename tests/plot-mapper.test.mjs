import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("auto CAD mapper is owner-only, project-native and keeps precise manual fallback", async () => {
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

  assert.match(mapper, /Rekixo Plot Mapper/);
  assert.match(mapper, /Perspective plot · 4 corners/);
  assert.match(mapper, /Main masterplan image/);
  assert.match(mapper, /toolMode/);
  assert.match(mapper, /"pan" \| "select"/);
  assert.match(mapper, /max="16"/);
  assert.match(mapper, /polygonSelfIntersects/);
  assert.match(mapper, /mappingDraftKey/);
  assert.match(mapper, /Clone prev/);
  assert.match(mapper, /Advanced CAD Assistant/);
  assert.match(mapper, /Shape independent save/);
  assert.doesNotMatch(mapper, /Rectangle · 2 taps/);
  assert.doesNotMatch(mapper, />Move image</);
  assert.match(mapper, /snapPoint/);
  assert.match(mapper, /mapper-loupe/);
  assert.match(mapper, /solveHomography/);
  assert.match(mapper, /bestCadLabel/);
  assert.match(mapper, /publishAutoMatches/);
  assert.match(mapper, /plotSheet/);
  assert.match(mapper, /sourceCad/);
  assert.match(mapper, /MAX_MAPPING_DIMENSION = 6144/);
  assert.match(mapper, /Keep the exact project aspect ratio/);
  assert.doesNotMatch(mapper, /MAP_WIDTH = 1200/);
  assert.doesNotMatch(mapper, /MAP_HEIGHT = 2133/);

  assert.match(api, /requireSuperAdmin/);
  assert.match(legacyApi, /status:403/);
  assert.match(api, /parseCadGeometry/);
  assert.match(api, /parsePlotSheetText/);
  assert.match(api, /sourceCad/);
  assert.match(api, /cadGeometry/);
  assert.match(api, /mapWidth/);
  assert.match(api, /mapHeight/);
  assert.match(api, /preserveGeometry/);
  assert.match(api, /Completed Tiyansh mapper locked/);
  assert.match(schema, /polygon:text\("polygon"\)/);

  assert.match(website, /setMapDimensions/);
  assert.match(website, /s\.mapWidth/);
  assert.match(website, /s\.mapHeight/);
  assert.match(website, /project-asset\/masterplan/);
  assert.match(website, /mapWidth:W,mapHeight:H/);
  assert.match(website, /ACTIVE_PROJECT_ID/);
  assert.match(website, /world\.style\.visibility = 'hidden'/);
  assert.match(three, /DEFAULT_IMG_W=1200,DEFAULT_IMG_H=2133/);
  assert.match(three, /this\.imgW=Math\.max/);
  assert.match(three, /this\.imgH=Math\.max/);
  assert.doesNotMatch(three, /const IMG_W=1200,IMG_H=2133/);

  assert.doesNotMatch(clientAdmin, /PlotMapper/);
  assert.match(superAdmin, /PlotMapper/);
  assert.match(superAdmin, /projectId=\{projectId\}/);
});
