import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("platform host stays empty until a real boss domain is configured", async () => {
  const [context, prepare] = await Promise.all([
    source("../app/project-context.ts"),
    source("../scripts/prepare-cloudflare-deploy.mjs"),
  ]);

  assert.match(context, /CLIENT_PLATFORM_HOST \|\| ""/);
  assert.doesNotMatch(context, /CLIENT_PLATFORM_HOST \|\| "sites\.rekixo\.com"/);
  assert.match(
    prepare,
    /String\(process\.env\.REKIXO_PLATFORM_HOST \|\| ""\)[\s\S]*?\.trim\(\)/,
  );
  assert.doesNotMatch(prepare, /\|\| "sites\.rekixo\.com"/);
});

test("one helper owns platform, custom-domain and workers.dev project links", async () => {
  const [context, links, users, publicData, domains, publish] = await Promise.all([
    source("../app/project-context.ts"),
    source("../app/project-links.ts"),
    source("../app/api/admin/users/route.ts"),
    source("../app/api/public-data/route.ts"),
    source("../app/api/admin/domains/route.ts"),
    source("../app/api/admin/publish/route.ts"),
  ]);

  assert.match(context, /rekixo-client-sites\.ai-8f3\.workers\.dev/);
  assert.ok(links.includes("const projectPath = `/projects/${encodeURIComponent(slug)}`;"));
  assert.ok(links.includes("const fallbackUrl = absoluteUrl(fallbackHost, projectPath);"));
  assert.ok(links.includes("fallbackAdminUrl"));
  assert.ok(links.includes("/admin-login"));
  assert.ok(links.includes("publicUrl: platformUrl || customPublicUrl || fallbackUrl"));
  assert.ok(links.includes("adminUrl: platformAdminUrl || customAdminUrl || fallbackAdminUrl"));

  for (const wired of [users, publicData, domains, publish]) {
    assert.match(wired, /currentProjectLinks/);
  }
});

test("explicit platform host is canonical while old short links remain redirect-only", async () => {
  const [links, legacyPage, domains, publish] = await Promise.all([
    source("../app/project-links.ts"),
    source("../app/p/[slug]/page.tsx"),
    source("../app/api/admin/domains/route.ts"),
    source("../app/api/admin/publish/route.ts"),
  ]);

  assert.ok(links.includes("const canonicalAdminHost = platformHost || sharedAdminHost;"));
  assert.ok(links.includes("publicUrl: platformUrl || customPublicUrl || fallbackUrl"));
  assert.ok(links.includes("adminUrl: platformAdminUrl || customAdminUrl || fallbackAdminUrl"));
  assert.ok(legacyPage.includes("permanentRedirect(`/projects/${encodeURIComponent(slug)}`)"));
  assert.doesNotMatch(domains, /\/p\/\$\{encodeURIComponent/);
  assert.doesNotMatch(publish, /\/p\/\$\{encodeURIComponent/);
});
