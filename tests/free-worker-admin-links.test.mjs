import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("platform host stays empty until a real boss domain is configured", async () => {
  const [context, prepare] = await Promise.all([
    source("../app/project-context.ts"),
    source("../scripts/prepare-cloudflare-deploy.mjs"),
  ]);

  assert.match(
    context,
    /CLIENT_PLATFORM_HOST \|\| ""/,
  );
  assert.doesNotMatch(
    context,
    /CLIENT_PLATFORM_HOST \|\| "sites\.rekixo\.com"/,
  );

  assert.match(
    prepare,
    /String\(process\.env\.REKIXO_PLATFORM_HOST \|\| ""\)\.trim\(\)/,
  );
  assert.doesNotMatch(
    prepare,
    /\|\| "sites\.rekixo\.com"/,
  );
});

test("client login URL falls back to the free generic workers.dev host", async () => {
  const [users, publicData, domains] = await Promise.all([
    source("../app/api/admin/users/route.ts"),
    source("../app/api/public-data/route.ts"),
    source("../app/api/admin/domains/route.ts"),
  ]);

  assert.match(users, /CLIENT_FALLBACK_HOST/);
  assert.match(users, /\/projects\/\$\{encodeURIComponent\(slug\)\}\/admin-login/);

  assert.match(publicData, /fallback/);
  assert.match(publicData, /\$\{projectPath\}\/admin-login/);

  assert.match(domains, /fallbackUrl:/);
  assert.match(domains, /\/projects\/\$\{encodeURIComponent\(slug\)\}\/admin-login/);
});

test("future explicit REKIXO_PLATFORM_HOST still becomes the canonical boss-domain path", async () => {
  const [prepare, users, publicData] = await Promise.all([
    source("../scripts/prepare-cloudflare-deploy.mjs"),
    source("../app/api/admin/users/route.ts"),
    source("../app/api/public-data/route.ts"),
  ]);

  assert.match(prepare, /REKIXO_PLATFORM_HOST/);
  assert.match(users, /if\(platform&&slug\)return `https:\/\/\$\{platform\}\/projects\//);
  assert.match(publicData, /platform\s*\?\s*`https:\/\/\$\{platform\}\$\{projectPath\}\/admin-login`/);
});
