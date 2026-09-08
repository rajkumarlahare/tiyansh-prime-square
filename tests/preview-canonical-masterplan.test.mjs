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

test("preview uses optimized project masterplan with canonical fallback and saved public rotation", async () => {
  const site = await source("../public/project/index.html");
  assert.ok(site.includes("ACTIVE_PROJECT_ID=data.projectId"));
  assert.ok(site.includes("canonicalForward.set('projectId',ACTIVE_PROJECT_ID)"));
  assert.ok(site.includes("window.REKIXO_PROJECT_QUERY=canonicalForward.toString()"));
  assert.ok(site.includes("canonicalForward.set('assetRev',String(Date.now()))"));
  assert.ok(site.includes("publicParams.set('variant','public')"));
  assert.ok(site.includes("preferredMasterUrl='/api/project-asset/masterplan?'"));
  assert.ok(site.includes("canonicalMasterUrl='/api/project-asset/masterplan?'"));
  assert.ok(site.includes("loadMaster(true,true)"));
  assert.ok(site.includes("publicRotation=normalizeQuarterTurn(s.publicRotation)"));
  assert.ok(site.includes("rotate(${publicRotation*90}deg)"));
  assert.ok(site.includes("u=rotateOffset(dx,dy,(4-publicRotation)%4)"));
});
