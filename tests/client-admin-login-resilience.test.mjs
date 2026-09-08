import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("client admin login owns critical styling instead of depending on a CSS request", async () => {
  const [layout, form, criticalCss] = await Promise.all([
    source("../app/layout.tsx"),
    source("../app/admin/login/login-form.tsx"),
    source("../app/admin/login/login-critical.ts"),
  ]);
  assert.doesNotMatch(layout, /login\.css/);
  assert.match(form, /LOGIN_CRITICAL_CSS/);
  assert.match(form, /data-rekixo-login-critical/);
  assert.match(form, /data-rekixo-login/);
  assert.match(criticalCss, /\.login-card/);
  assert.match(criticalCss, /\.login-input/);
  assert.match(criticalCss, /\.login-submit/);
  assert.match(criticalCss, /min-height:\s*100svh/);
  assert.match(criticalCss, /@media \(max-width:\s*600px\)/);
});

test("shared project login carries tenant identity and returns to that exact project", async () => {
  const [page, form] = await Promise.all([
    source("../app/projects/[slug]/admin-login/page.tsx"),
    source("../app/admin/login/login-form.tsx"),
  ]);
  assert.match(page, /projectName=\{project\.name\}/);
  assert.match(page, /projectSlug=\{project\.slug\}/);
  assert.match(page, /backPath=\{base\}/);
  assert.ok(form.includes("tenantLabel"));
  assert.ok(form.includes("resolvedBackPath"));
  assert.ok(form.includes("href={resolvedBackPath}"));
  assert.ok(form.includes("Project: <b>{tenantLabel}</b>"));
  assert.ok(form.includes('"Client Admin"'));
  assert.equal(form.includes('from "next/link"'), false);
});

test("production config and Worker provide two independent asset-delivery defenses", async () => {
  const [nextConfig, worker, helpers, deploy] = await Promise.all([
    source("../next.config.ts"),
    source("../worker/index.ts"),
    source("../worker/shared-assets.mjs"),
    source("../scripts/prepare-cloudflare-deploy.mjs"),
  ]);
  assert.match(nextConfig, /assetPrefix:\s*"\/__rekixo"/);
  assert.ok(deploy.includes("${platformHost}/__rekixo/*"));
  assert.match(worker, /fetchPrefixedFrameworkAsset/);
  assert.match(worker, /env\.ASSETS\.fetch\(request\)/);
  assert.ok(worker.includes('headers.get("link")'));
  assert.match(helpers, /rewriteAssetReferences/);
});
