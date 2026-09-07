import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("CAD source parser is pinned, AC1021-capable path is wired and source assets stay private", async () => {
  const [pkg, lock, cad, asset, spec] = await Promise.all([
    source("../package.json"),
    source("../package-lock.json"),
    source("../app/cad-import.ts"),
    source("../app/api/project-asset/[kind]/route.ts"),
    source("../AUTO-CAD-MAPPER-SPEC.md"),
  ]);
  assert.match(pkg, /"@node-projects\/acad-ts": "2\.4\.0"/);
  assert.match(lock, /acad-ts-2\.4\.0\.tgz/);
  assert.match(lock, /sha512-gElmaVe8URFRGSXbWmJ0DPcPtF4QQepzC85jY61xEM8AN8HpQPUpn2XtPgolv\/7D3rUUqlmJ15TsZeORgbk8Qg==/);
  assert.match(cad, /DwgReader\.readFromStream/);
  assert.match(cad, /DxfReader\.readFromStream/);
  assert.match(cad, /entity\.isClosed/);
  assert.match(cad, /lineNetworkFaces/);
  assert.match(cad, /LINE-FACE/);
  assert.match(cad, /rawArea/);
  assert.match(asset, /SUPER_ADMIN_ONLY/);
  assert.match(asset, /sourceCad/);
  assert.match(asset, /cadGeometry/);
  assert.match(asset, /masterplanOriginal/);
  assert.match(asset, /masterplanPublic/);
  assert.match(spec, /AC1021/);
  assert.match(spec, /146 total/);
});

test("homography, area confidence, snapping and inventory preservation are explicit release requirements", async () => {
  const [geometry, sheet, api, spec] = await Promise.all([
    source("../app/mapper-geometry.ts"),
    source("../app/plot-sheet.ts"),
    source("../app/api/super-mapper/route.ts"),
    source("../AUTO-CAD-MAPPER-SPEC.md"),
  ]);
  assert.match(geometry, /solveHomography/);
  assert.match(geometry, /least squares/i);
  assert.match(geometry, /site ke door-door corners/i);
  assert.match(geometry, /estimateCadAreaScale/);
  assert.match(geometry, /cadAreaErrorRatio/);
  assert.match(geometry, /occurs exactly once/i);
  assert.match(geometry, /snapPoint/);
  assert.match(geometry, /vertex/);
  assert.match(geometry, /edge/);
  assert.match(sheet, /plotnumber/);
  assert.match(sheet, /roadfacing/);
  assert.match(sheet, /duplicate Plot ID/);
  assert.match(sheet, /normalizedObject/);
  assert.match(api, /polygon=excluded\.polygon/);
  assert.match(api, /preserveGeometry/);
  assert.match(api, /calibrationPairs/);
  assert.match(api, /validatedSetting/);
  assert.match(spec, /never silently publish a guessed plot/i);
});

test("masterplan keeps original, high resolution mapping and lighter public copies without leaking mapper metadata", async () => {
  const [mapper, api, asset, publicData, gitignore] = await Promise.all([
    source("../app/plot-mapper.tsx"),
    source("../app/api/super-mapper/route.ts"),
    source("../app/api/project-asset/[kind]/route.ts"),
    source("../app/api/public-data/route.ts"),
    source("../.gitignore"),
  ]);
  assert.match(mapper, /mappingFile/);
  assert.match(mapper, /publicFile/);
  assert.match(mapper, /originalFile/);
  assert.match(mapper, /MAX_PUBLIC_DIMENSION/);
  assert.match(api, /masterplanOriginal/);
  assert.match(api, /masterplanPublic/);
  assert.match(api, /deleteSettings\(projectId/);
  assert.match(asset, /must-revalidate/);
  assert.match(publicData, /PUBLIC_SETTING_KEYS/);
  assert.doesNotMatch(publicData, /PUBLIC_SETTING_KEYS[\s\S]*"homography"/);
  assert.match(gitignore, /\.sites-runtime\//);
});
