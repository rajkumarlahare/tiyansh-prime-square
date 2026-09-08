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

test("public renderer keeps saved SVG polygons in canonical unrotated world", () => {
  assert.match(
    publicPage,
    /world\.style\.transform = `translate\(calc\(-50% \+ \$\{pan\.x\}px\),calc\(-50% \+ \$\{pan\.y\}px\)\) scale\(\$\{scale\}\)`/,
  );
  assert.doesNotMatch(publicPage, /PUBLIC_ROTATION/);
  assert.match(
    publicPage,
    /function clientToPlan\(x,y\)\{const r=viewport\.getBoundingClientRect\(\),dx=\(x-r\.left-r\.width\/2-pan\.x\)\/scale,dy=\(y-r\.top-r\.height\/2-pan\.y\)\/scale;return\{x:dx\+W\/2,y:dy\+H\/2\}\}/,
  );
  assert.match(publicPage, /setMapDimensions\(master\.naturalWidth,master\.naturalHeight\)/);
});
