import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("shared boss domain routes are narrow and never hijack the Vercel root", async () => {
  const deploy = await source("../scripts/prepare-cloudflare-deploy.mjs");

  for (const expected of [
    "${platformHost}/projects/*",
    "${platformHost}/__rekixo/*",
    "${platformHost}/api/public-data",
    "${platformHost}/api/project-asset/*",
    "${platformHost}/api/admin/*",
    "${platformHost}/api/data",
    "${platformHost}/api/gallery",
    "${platformHost}/api/gallery/*",
  ]) {
    assert.ok(deploy.includes(expected), `missing shared-domain route ${expected}`);
  }

  assert.doesNotMatch(deploy, /`\$\{platformHost\}\/\*`/);
  assert.match(deploy, /if \(mode === "client" && sharedDomainRoutes\.length\)/);
  assert.match(deploy, /delete config\.routes/);
});

test("Rekixo static assets use an isolated namespace on the shared domain", async () => {
  const [worker, projectPage, dashboard] = await Promise.all([
    source("../worker/index.ts"),
    source("../app/projects/[slug]/page.tsx"),
    source("../app/admin-dashboard.tsx"),
  ]);

  assert.match(worker, /SHARED_ASSET_PREFIX = "\/__rekixo"/);
  assert.match(worker, /stripSharedAssetPrefix/);
  assert.match(worker, /rewriteAssetReferences/);
  assert.match(worker, /CLIENT_PLATFORM_HOST/);
  assert.match(worker, /externalUrl\.pathname\.startsWith\("\/projects\/"\)/);
  assert.match(projectPage, /\/__rekixo\/project\/index\.html\?projectSlug=/);
  assert.match(dashboard, /\/__rekixo\/project\/masterplan\.jpg/);
});

test("free workers.dev fallback remains independent of shared-domain rewriting", async () => {
  const worker = await source("../worker/index.ts");
  assert.match(worker, /isSharedPlatformRequest\(externalUrl, env\)/);
  assert.match(worker, /configured && normalizedHost\(url\.hostname\) === configured/);
});
