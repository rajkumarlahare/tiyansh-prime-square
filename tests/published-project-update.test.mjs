import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const flat = (value) => value.replace(/\s+/g, " ");

test("published projects keep an explicit Publish Update action", async () => {
  const panel = await read("../app/project-publish-panel.tsx");
  const normalized = flat(panel);

  assert.ok(
    panel.includes('useState<"publish" | "unpublish" | null>(null)'),
    "publish/unpublish actions should have independent busy state",
  );
  assert.ok(
    normalized.includes('next === "publish" && state.publicStatus === "published"'),
    "the UI should distinguish first publish from republish",
  );
  assert.ok(
    panel.includes("Latest project changes ko public website par publish karein?"),
    "republish should ask for explicit confirmation",
  );
  assert.ok(
    panel.includes('"Publish Update"'),
    "published projects should expose Publish Update instead of hiding publish",
  );
  assert.ok(
    normalized.includes("published && !state.legacy"),
    "normal published projects should still retain Unpublish",
  );
});

test("republish bumps the public cache key instead of mutating polygon geometry", async () => {
  const [publishRoute, publicHtml, assetRoute] = await Promise.all([
    read("../app/api/admin/publish/route.ts"),
    read("../public/project/index.html"),
    read("../app/api/project-asset/[kind]/route.ts"),
  ]);

  assert.ok(
    publishRoute.includes("publish_version=publish_version+1"),
    "publish/republish must advance publishVersion",
  );
  assert.ok(publicHtml.includes("data.publishVersion"));
  assert.ok(publicHtml.includes("publicParams.set('v',masterVersion)"));
  assert.ok(assetRoute.includes("versionedRequest"));
  assert.ok(assetRoute.includes("public,max-age=31536000,immutable"));
  assert.ok(!publishRoute.includes("UPDATE plots SET polygon"));
});
