import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("share builder is a first-class reusable Super Admin workspace", async () => {
  const [dashboard, manager, route, css, users] = await Promise.all([
    readFile(new URL("../app/super-admin-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/project-share-manager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/project-share/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/super-mapper.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/users/route.ts", import.meta.url), "utf8"),
  ]);

  assert.ok(dashboard.includes('type WorkspaceTab = "clients" | "mapper" | "share"'));
  assert.ok(dashboard.includes("Share Builder"));
  assert.ok(dashboard.includes("ProjectShareManager"));
  assert.ok(manager.includes('const SHARE_TEMPLATE = "ar3d-standard-v1"'));
  assert.ok(manager.includes("CANVAS_WIDTH = 1200"));
  assert.ok(manager.includes("CANVAS_HEIGHT = 630"));
  assert.ok(manager.includes("drawCover"));
  assert.ok(manager.includes("Upload / replace logo"));
  assert.ok(manager.includes("Generate & save card"));
  assert.ok(manager.includes("Copy share link"));
  assert.ok(manager.includes("rekixo:share-profile-updated"));
  assert.ok(css.includes("REKIXO SHARE BUILDER V2"));
  assert.ok(route.includes("project.share_card_saved"));
  assert.ok(route.includes("shareTemplate"));
  assert.ok(route.includes('const cardUrl = settings.shareImage || ""'));
  assert.ok(users.includes("shareTitle:resolvedName"));
  assert.ok(users.includes('shareTemplate:"ar3d-standard-v1"'));
});

test("metadata-only edits rotate the share URL cache version", async () => {
  const route = await readFile(
    new URL("../app/api/admin/project-share/route.ts", import.meta.url),
    "utf8",
  );
  assert.ok(route.includes("Any metadata edit gets a fresh share URL"));
  assert.ok(route.includes('writeSetting(projectId, "shareVersion", version, now)'));
});
