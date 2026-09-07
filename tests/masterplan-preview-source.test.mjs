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

test("generic preview and public site use canonical mapped masterplan first", () => {
  assert.match(
    route,
    /const canonicalKind = kind === "masterplan" \? "masterplan" : kind/,
  );
  assert.match(
    route,
    /env\.BUCKET\.get\(`projects\/\$\{projectId\}\/mapper\/\$\{canonicalKind\}`\)/,
  );
  assert.match(
    route,
    /if \(!object && kind === "masterplan"\)[\s\S]*masterplanPublic/,
  );
  assert.doesNotMatch(
    route,
    /kind === "masterplan" && session\?\.role !== "super_admin"/,
  );
});

test("authenticated preview never caches stale masterplan response", () => {
  assert.match(
    route,
    /const previewRequest = new URL\(request\.url\)\.searchParams\.get\("preview"\) === "1"/,
  );
  assert.match(route, /session \|\| previewRequest[\s\S]*\? "no-store"/);
  assert.match(route, /x-rekixo-masterplan-source/);
});

test("public renderer keeps image and normalized SVG polygons in one rotated world", () => {
  assert.match(
    publicPage,
    /world\.style\.transform = `translate\(calc\(-50% \+ \$\{pan\.x\}px\),calc\(-50% \+ \$\{pan\.y\}px\)\) scale\(\$\{scale\}\) rotate\(\$\{PUBLIC_ROTATION\*90\}deg\)`/,
  );
  assert.match(publicPage, /function clientToPlan\(x,y\)/);
  assert.match(publicPage, /setMapDimensions\(master\.naturalWidth,master\.naturalHeight\)/);
});
