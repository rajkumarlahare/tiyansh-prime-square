import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = new URL(`${encodeURIComponent(entry.name)}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) files.push(...(await listFiles(child)));
    else files.push(child.pathname);
  }
  return files;
}



test("build emits a Cloudflare Worker and client assets", async () => {
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/client", import.meta.url));
  const worker = await readFile(new URL("../dist/server/index.js", import.meta.url), "utf8");
  assert.match(worker, /fetch/);
});

test("production build emits JS and CSS inside the isolated Rekixo asset namespace", async () => {
  const assetRoot = new URL("../dist/client/__rekixo/_next/static/", import.meta.url);
  await access(assetRoot);
  const files = await listFiles(assetRoot);
  assert.ok(files.some((file) => file.endsWith(".js")), "missing prefixed JS assets");
  assert.ok(files.some((file) => file.endsWith(".css")), "missing prefixed CSS assets");
});

test("client access includes mandatory password change and tenant guards", async () => {
  const [auth, changePassword, projectContext] = await Promise.all([
    readFile(new URL("../app/admin-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/change-password/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/project-context.ts", import.meta.url), "utf8"),
  ]);
  assert.match(auth, /row\.role!=="client_admin"/);
  assert.match(auth, /session_version AS sessionVersion/);
  assert.match(changePassword, /must_change_password=0/);
  // V5 multi-domain tenant routing: exact domain registry + legacy bridge + platform preview.
  assert.match(projectContext, /FROM project_domains d JOIN projects p ON p\.id=d\.project_id/);
  assert.match(projectContext, /WHERE d\.host=\?/);
  assert.match(projectContext, /legacyProjectForHost\(host\)/);
  assert.match(projectContext, /searchParams\.get\("projectId"\)/);
  assert.match(projectContext, /searchParams\.get\("projectSlug"\)/);
  assert.match(projectContext, /legacy\.adminHost === host/);
  assert.match(projectContext, /host === legacyFallbackHost\(\)/);
  assert.match(projectContext, /projectById\(DEFAULT_PROJECT_ID\)/);
});
