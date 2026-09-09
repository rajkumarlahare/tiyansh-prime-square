import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Open Graph share image uses a crawler-safe public slug/version path", async () => {
  const page = await readFile(
    new URL("../app/projects/[slug]/page.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(page.includes("'shareVersion'"));
  assert.ok(page.includes("/share-image/"));
  assert.ok(page.includes("project.slug"));
  assert.ok(page.includes("settings.shareVersion"));
  assert.ok(!page.includes("settings.shareImage || logoPath"));
});

test("public share-image route is session-free, GET+HEAD capable and immutable", async () => {
  const route = await readFile(
    new URL(
      "../app/projects/[slug]/share-image/[version]/route.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.ok(route.includes("projectBySlug(slug)"));
  assert.ok(route.includes("export async function GET"));
  assert.ok(route.includes("export async function HEAD"));
  assert.ok(route.includes('"content-length"'));
  assert.ok(route.includes('"content-disposition": "inline"'));
  assert.ok(route.includes("public,max-age=31536000,immutable"));
  assert.ok(route.includes('"access-control-allow-origin": "*"'));
  assert.ok(!route.includes("getAdminSession"));
  assert.ok(!route.includes("projectId="));
});

test("share uploads persist immutable versioned R2 snapshots plus canonical fallback", async () => {
  const route = await readFile(
    new URL("../app/api/admin/project-share/route.ts", import.meta.url),
    "utf8",
  );

  assert.ok(route.includes("share/cards/${version}"));
  assert.ok(route.includes("share/card"));
  assert.ok(route.includes("await file.arrayBuffer()"));
  assert.ok(route.includes('source: "original-upload"'));
});

test("shared platform explicit project selectors win before exact-domain fallback", async () => {
  const context = await readFile(
    new URL("../app/project-context.ts", import.meta.url),
    "utf8",
  );

  const platformIndex = context.indexOf("if (isPlatformAccessHost(host))");
  const exactIndex = context.indexOf("const domain = await exactDomain(host)");

  assert.ok(platformIndex >= 0);
  assert.ok(exactIndex > platformIndex);
  assert.ok(context.includes("requestedId"));
  assert.ok(context.includes("requestedSlug"));
});
