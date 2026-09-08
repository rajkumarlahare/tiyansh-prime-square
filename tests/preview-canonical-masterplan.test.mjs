import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("authenticated preview canonicalizes old short project ids before rendering", async () => {
  const preview = await source("../app/preview/[projectId]/page.tsx");
  assert.ok(preview.includes('session.role === "super_admin"'));
  assert.ok(preview.includes("WHERE id LIKE ? AND status='active' ORDER BY id LIMIT 2"));
  assert.ok(preview.includes(".bind(`${projectId}%`)"));
  assert.ok(preview.includes("if (matches.length === 1)"));
  assert.ok(preview.includes("redirect(`/preview/${encodeURIComponent(matches[0].id)}`)"));
});

test("preview uses canonical project masterplan while polygon geometry stays unrotated", async () => {
  const site = await source("../public/project/index.html");
  assert.ok(site.includes("ACTIVE_PROJECT_ID=data.projectId"));
  assert.ok(site.includes("canonicalForward.set('projectId',ACTIVE_PROJECT_ID)"));
  assert.ok(site.includes("window.REKIXO_PROJECT_QUERY=canonicalForward.toString()"));
  assert.ok(site.includes("canonicalForward.set('assetRev',String(Date.now()))"));
  assert.ok(site.includes("master.src='/api/project-asset/masterplan'+(window.REKIXO_PROJECT_QUERY||'')"));
  assert.ok(site.includes("Canonical world: image + saved SVG geometry are never runtime-rotated"));
  assert.ok(!site.includes("PUBLIC_ROTATION"));
});
