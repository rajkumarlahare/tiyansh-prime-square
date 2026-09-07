import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("build emits a Cloudflare Worker and client assets", async () => {
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/client", import.meta.url));
  const worker = await readFile(new URL("../dist/server/index.js", import.meta.url), "utf8");
  assert.match(worker, /fetch/);
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
  assert.match(projectContext, /public_host = \?/);
  assert.match(projectContext, /searchParams\.get\("projectId"\)/);
  assert.match(projectContext, /preview\.adminHost===host/);
  assert.match(projectContext, /host===fallback\?DEFAULT_PROJECT_ID:null/);
});
