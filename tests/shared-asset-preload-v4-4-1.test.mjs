import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SHARED_ASSET_PREFIX,
  rewriteAssetReferences,
  shouldRewriteAssetBody,
} from "../worker/shared-assets.mjs";

const worker = readFileSync(
  new URL("../worker/index.ts", import.meta.url),
  "utf8",
);
const deploy = readFileSync(
  new URL("../scripts/prepare-cloudflare-deploy.mjs", import.meta.url),
  "utf8",
);

test("direct prefixed framework assets are compatibility-rewritten on the shared host", () => {
  assert.match(worker, /if\s*\(\s*sharedPlatform\s*&&\s*\(/s);
  assert.match(
    worker,
    /externalUrl\.pathname\.startsWith\("\/projects\/"\)\s*\|\|\s*isolatedAssetRequest/s,
  );
  assert.match(worker, /response = await rewriteSharedAssets\(response\)/);
  assert.doesNotMatch(
    worker,
    /sharedPlatform\s*&&\s*!directPrefixedAsset\s*&&/,
  );
});

test("root Vite CSS preload references are rewritten into Rekixo isolated namespace", () => {
  assert.equal(SHARED_ASSET_PREFIX, "/__rekixo");

  const cssHref = "/assets/geo-public-map-BsZsBPp8.css";
  assert.equal(
    rewriteAssetReferences(`"${cssHref}"`),
    `"/__rekixo${cssHref}"`,
  );

  assert.equal(
    rewriteAssetReferences("url(/assets/geo-public-map-BsZsBPp8.css)"),
    "url(/__rekixo/assets/geo-public-map-BsZsBPp8.css)",
  );

  assert.equal(
    rewriteAssetReferences('href="/__rekixo/assets/already.css"'),
    'href="/__rekixo/assets/already.css"',
  );

  assert.equal(shouldRewriteAssetBody("application/javascript"), true);
  assert.equal(shouldRewriteAssetBody("text/css"), true);
});

test("shared domain still routes only the isolated Rekixo namespace, not host-wide assets", () => {
  assert.match(deploy, /`\$\{platformHost\}\/__rekixo\/\*`/);
  assert.doesNotMatch(deploy, /`\$\{platformHost\}\/assets\/\*`/);
  assert.doesNotMatch(deploy, /`\$\{platformHost\}\/\*`/);
});
