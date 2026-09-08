import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [auth, mapper, assets, gallery] = await Promise.all([
  readFile(new URL("../app/admin-auth.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/plot-mapper.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/project-asset/[kind]/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/gallery/[id]/route.ts", import.meta.url), "utf8"),
]);

test("incident signature: legacy super session fallback exists while mapper selects explicit project", () => {
  assert.match(auth, /role:"super_admin",projectId:"tiyansh-prime-square"/);
  assert.match(
    mapper,
    /\/api\/project-asset\/\$\{kind\}\?projectId=\$\{encodeURIComponent\(projectId\)\}/,
  );
});

test("super admin explicit selected project always wins for assets", () => {
  assert.match(assets, /if \(session\?\.role === "super_admin"\)/);
  assert.match(assets, /activeProjectId\(requested \|\| session\.projectId\)/);
  assert.doesNotMatch(
    assets,
    /session\?\.role === "super_admin" && requested && preview/,
  );
  assert.doesNotMatch(assets, /if \(session\?\.projectId\) return session\.projectId/);
  assert.match(assets, /headers\.set\("x-rekixo-project", projectId\)/);
});

test("client admin explicit foreign project is rejected", () => {
  assert.match(assets, /if \(requested && requested !== session\.projectId\) return null/);
  assert.match(gallery, /if \(requested && requested !== session\.projectId\) return null/);
});

test("gallery follows the same selected-project rule", () => {
  assert.match(gallery, /if \(session\?\.role === "super_admin"\)/);
  assert.match(gallery, /activeProjectId\(requested \|\| session\.projectId\)/);
  assert.doesNotMatch(
    gallery,
    /session\?\.role === "super_admin" && requested && preview/,
  );
});
