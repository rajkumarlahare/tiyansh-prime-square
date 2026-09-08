import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("V5 adds multi-domain registry and publish gate without duplicating project data", async () => {
  const [migration, schema, context] = await Promise.all([
    source("../drizzle/0006_rekixo_platform_domains.sql"),
    source("../db/schema.ts"),
    source("../app/project-context.ts"),
  ]);
  assert.match(migration, /CREATE TABLE `project_domains`/);
  assert.match(migration, /public_status/);
  assert.match(migration, /tiyansh-prime-square/);
  assert.match(schema, /projectDomains/);
  assert.match(context, /project_domains/);
  assert.match(context, /publicStatus === "published"/);
  assert.match(context, /platformSlugFromHost/);
});

test("draft projects remain previewable only through authenticated preview", async () => {
  const [preview, publicData, asset, gallery] = await Promise.all([
    source("../app/preview/[projectId]/page.tsx"),
    source("../app/api/public-data/route.ts"),
    source("../app/api/project-asset/[kind]/route.ts"),
    source("../app/api/gallery/[id]/route.ts"),
  ]);
  assert.match(preview, /validAdminSession/);
  assert.match(preview, /session\.projectId !== projectId/);
  assert.match(preview, /preview=1/);
  assert.match(publicData, /previewProjectId/);
  assert.match(publicData, /session\.role !== "super_admin"/);
  // Preview authentication is enforced by the preview page + public-data route.
  // Asset/gallery routes must additionally honor the Super Admin's explicitly
  // selected tenant instead of falling back to the legacy Tiyansh session project.
  assert.match(asset, /if \(session\?\.role === "super_admin"\)/);
  assert.match(asset, /activeProjectId\(requested \|\| session\.projectId\)/);
  assert.match(asset, /if \(requested && requested !== session\.projectId\) return null/);
  assert.match(gallery, /if \(session\?\.role === "super_admin"\)/);
  assert.match(gallery, /activeProjectId\(requested \|\| session\.projectId\)/);
  assert.match(gallery, /if \(requested && requested !== session\.projectId\) return null/);
});

test("technical CAD/PDF internals are not exposed as normal public assets", async () => {
  const asset = await source("../app/api/project-asset/[kind]/route.ts");
  assert.match(asset, /PUBLIC_KINDS = new Set\(\["masterplan"\]\)/);
  assert.match(asset, /ADMIN_KINDS = new Set\(\["sourcePdf"\]\)/);
  assert.match(asset, /SUPER_ADMIN_ONLY/);
});

test("one generic client Worker is deployed while legacy Tiyansh remains as zero-downtime bridge", async () => {
  const [prepare, workflow] = await Promise.all([
    source("../scripts/prepare-cloudflare-deploy.mjs"),
    source("../.github/workflows/deploy-cloudflare.yml"),
  ]);
  assert.match(prepare, /rekixo-client-sites/);
  assert.match(prepare, /tiyansh-prime-square/);
  assert.match(prepare, /CLIENT_PLATFORM_HOST/);
  assert.match(workflow, /Generic Client Sites Worker/);
  assert.match(workflow, /Legacy Tiyansh Worker/);
  assert.match(workflow, /rekixo-super-admin/);
  assert.match(prepare, /tiyansh-production/);
  assert.match(prepare, /tiyansh-gallery-production/);
});

test("public site forwards host/path preview context and correct client admin destination", async () => {
  const website = await source("../public/project/index.html");
  assert.match(website, /projectSlug/);
  assert.match(website, /preview/);
  assert.match(website, /ADMIN_URL=data\.adminUrl/);
  assert.match(website, /window\.top\.location\.href=ADMIN_URL/);
});

test("super admin gets project-level domain and publish controls", async () => {
  const [dashboard, domains, publish] = await Promise.all([
    source("../app/super-admin-dashboard.tsx"),
    source("../app/api/admin/domains/route.ts"),
    source("../app/api/admin/publish/route.ts"),
  ]);
  assert.match(dashboard, /ProjectDomainManager/);
  assert.match(dashboard, /ProjectPublishPanel/);
  assert.match(domains, /requireSuperAdmin/);
  assert.match(domains, /sameOrigin/);
  assert.match(publish, /boundary pending/);
  assert.match(publish, /project\.published/);
});
