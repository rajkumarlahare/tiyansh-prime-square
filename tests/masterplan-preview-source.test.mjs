import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(
  new URL("../app/api/project-asset/[kind]/route.ts", import.meta.url),
  "utf8",
);
const publicPage = await readFile(
  new URL("../public/project/index.html", import.meta.url),
  "utf8",
);

test("generic preview and public site can request optimized masterplan with canonical fallback", () => {
  assert.match(route, /wantsPublicMasterplan/);
  assert.match(route, /"masterplanPublic"/);
  assert.match(route, /"public-optimized"/);
  assert.match(route, /"canonical-fallback"/);
  assert.match(route, /versionedRequest/);
  assert.doesNotMatch(
    route,
    /kind === "masterplan" && session\?\.role !== "super_admin"/,
  );
});

test("authenticated preview never caches stale masterplan response", () => {
  assert.match(
    route,
    /const previewRequest = requestUrl\.searchParams\.get\("preview"\) === "1"/,
  );
  assert.match(route, /session \|\| previewRequest[\s\S]*\? "no-store"/);
  assert.match(route, /x-rekixo-masterplan-source/);
});

test("public renderer rotates image and SVG together while keeping polygon storage canonical", () => {
  assert.match(
    publicPage,
    /world\.style\.transform = `translate3d\(calc\(-50% \+ \$\{pan\.x\}px\),calc\(-50% \+ \$\{pan\.y\}px\),0\) scale\(\$\{scale\}\) rotate\(\$\{publicRotation\*90\}deg\)`/,
  );
  assert.match(publicPage, /publicRotation=normalizeQuarterTurn\(s\.publicRotation\)/);
  assert.match(publicPage, /const ctm=svg\.getScreenCTM\?\.\(\)/);
  assert.match(publicPage, /const point=svg\.createSVGPoint\(\)/);
  assert.match(publicPage, /point\.matrixTransform\(ctm\.inverse\(\)\)/);
  assert.match(publicPage, /const native=nativePlotAtClient\(x,y\)/);
  assert.match(
    publicPage,
    /u=rotateOffset\(dx,dy,\(4-publicRotation\)%4\)/,
  );
  assert.match(publicPage, /setMapDimensions\(master\.naturalWidth,master\.naturalHeight\)/);
});
