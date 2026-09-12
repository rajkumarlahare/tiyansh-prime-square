import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("share builder uses the final customer poster as-is", async () => {
  const [dashboard, manager, route, css, provisioning] = await Promise.all([
    readFile(new URL("../app/super-admin-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/project-share-manager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/project-share/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/super-mapper.css", import.meta.url), "utf8"),
    readFile(new URL("../app/project-provisioning.ts", import.meta.url), "utf8"),
  ]);

  // Workspace membership is intentionally tested without freezing the exact tab
  // union, so adding future workspaces (for example Project Profile) cannot break
  // an unrelated Share Builder regression.
  assert.match(dashboard, /type WorkspaceTab = [^;]*"share"[^;]*;/);
  assert.ok(dashboard.includes("Share Builder"));
  assert.ok(manager.includes('const SHARE_TEMPLATE = "original-image-v1"'));
  assert.ok(manager.includes("SHARE IMAGE / WHATSAPP POSTER"));
  assert.ok(manager.includes('form.set("file", shareImageFile)'));
  assert.ok(manager.includes("Save share image"));
  assert.ok(manager.includes("no crop"));
  assert.ok(!manager.includes("CANVAS_WIDTH"));
  assert.ok(!manager.includes("drawCover"));
  assert.ok(!manager.includes('context.fillText("AR 3D VISION"'));
  assert.ok(css.includes("ORIGINAL POSTER"));
  assert.ok(css.includes("object-fit:contain"));
  assert.ok(!css.includes("aspect-ratio:1200/630"));
  assert.ok(route.includes("detectShareImageMime"));
  assert.ok(route.includes('contentType: detectedMime'));
  assert.match(provisioning, /shareTemplate:\s*"original-image-v1"/);
});

test("metadata-only edits still rotate the share URL cache version", async () => {
  const route = await readFile(
    new URL("../app/api/admin/project-share/route.ts", import.meta.url),
    "utf8",
  );
  assert.ok(route.includes("Any metadata edit gets a fresh share URL"));
  assert.ok(route.includes('writeSetting(projectId, "shareVersion", version, now)'));
});
