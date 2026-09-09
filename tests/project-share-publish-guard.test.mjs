import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("publish readiness requires share metadata and generated card", async () => {
  const [publishRoute, assetRoute, panel] = await Promise.all([
    readFile(new URL("../app/api/admin/publish/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/project-asset/[kind]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/project-publish-panel.tsx", import.meta.url), "utf8"),
  ]);

  assert.ok(publishRoute.includes("shareTitle"));
  assert.ok(publishRoute.includes("Share title required"));
  assert.ok(publishRoute.includes("Share description required"));
  assert.ok(publishRoute.includes("Share preview image required"));
  assert.ok(assetRoute.includes('"masterplan", "logo", "shareCard"'));
  assert.ok(assetRoute.includes("/share/card"));
  assert.ok(assetRoute.includes('kind === "shareCard"'));
  assert.ok(panel.includes("rekixo:share-profile-updated"));
});

test("project Open Graph image is 1200x630 while favicon stays the project logo", async () => {
  const page = await readFile(
    new URL("../app/projects/[slug]/page.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(page.includes("hasShareImage"));
  assert.ok(page.includes("width: 1200"));
  assert.ok(page.includes("height: 630"));
  assert.ok(page.includes("icons: meta.logoUrl"));
  assert.ok(page.includes('card: meta.hasShareImage ? "summary_large_image" : "summary"'));
});
