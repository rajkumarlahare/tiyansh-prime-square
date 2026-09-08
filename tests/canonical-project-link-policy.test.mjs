import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("all server link producers use the canonical project-link helper", async () => {
  const [domains, publish, users, publicData] = await Promise.all([
    source("../app/api/admin/domains/route.ts"),
    source("../app/api/admin/publish/route.ts"),
    source("../app/api/admin/users/route.ts"),
    source("../app/api/public-data/route.ts"),
  ]);

  for (const file of [domains, publish, users, publicData]) {
    assert.match(file, /currentProjectLinks/);
  }

  assert.doesNotMatch(domains, /\/p\/\$\{encodeURIComponent/);
  assert.doesNotMatch(publish, /\/p\/\$\{encodeURIComponent/);
});

test("Super Admin UI exposes canonical website/admin and does not override server-generated admin URL", async () => {
  const [credentials, domainsUi, publishUi, dashboard] = await Promise.all([
    source("../app/client-admin-manager.tsx"),
    source("../app/project-domain-manager.tsx"),
    source("../app/project-publish-panel.tsx"),
    source("../app/super-admin-dashboard.tsx"),
  ]);

  assert.ok(credentials.includes("data.user.adminUrl||data.clientAdminUrl||fallbackAdminUrl"));
  assert.ok(credentials.includes("adminUrl:user.adminUrl||fallbackAdminUrl"));
  assert.doesNotMatch(credentials, /data\.user\.adminHost\?/);

  for (const label of [
    "Canonical website",
    "Canonical client admin",
    "Free fallback website",
    "Free fallback admin",
  ]) {
    assert.ok(domainsUi.includes(label), `missing domain-manager label: ${label}`);
  }

  assert.ok(publishUi.includes("Client admin"));
  assert.ok(publishUi.includes("Canonical site:"));
  assert.ok(publishUi.includes("Canonical admin:"));
  assert.ok(publishUi.includes("Free fallback site:"));
  assert.ok(publishUi.includes("Free fallback admin:"));
  assert.ok(dashboard.includes("Authenticated preview"));
});

test("customer website consumes public-data adminUrl and project admin stays tenant-scoped", async () => {
  const [website, loginPage, adminPage] = await Promise.all([
    source("../public/project/index.html"),
    source("../app/projects/[slug]/admin-login/page.tsx"),
    source("../app/projects/[slug]/admin/page.tsx"),
  ]);

  assert.match(website, /ADMIN_URL=data\.adminUrl/);
  assert.match(website, /window\.top\.location\.href=ADMIN_URL/);
  assert.match(loginPage, /projectId=\{project\.id\}/);
  assert.match(adminPage, /session\.projectId !== project\.id/);
});
