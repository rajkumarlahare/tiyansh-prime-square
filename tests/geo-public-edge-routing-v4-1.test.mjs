import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("customer Geo public APIs are routed through the generic Client Worker", async () => {
  const [deploy, client, publicGeo] = await Promise.all([
    source("../scripts/prepare-cloudflare-deploy.mjs"),
    source("../app/projects/[slug]/map/geo-public-map.tsx"),
    source("../app/api/public-geo/route.ts"),
  ]);

  // One narrow prefix route intentionally covers both endpoints plus query strings:
  // /api/public-geo?projectSlug=...
  // /api/public-geo-masterplan?projectSlug=...&v=...
  assert.ok(
    deploy.includes("${platformHost}/api/public-geo*"),
    "shared platform route for public Geo API prefix is missing",
  );
  assert.match(client, /\/api\/public-geo\?projectSlug=/);
  assert.match(publicGeo, /\/api\/public-geo-masterplan\?projectSlug=/);
});

test("public Geo route remains query-safe and does not widen shared-domain ownership", async () => {
  const deploy = await source("../scripts/prepare-cloudflare-deploy.mjs");

  assert.doesNotMatch(
    deploy,
    /`\$\{platformHost\}\/api\/public-geo`,/,
    "public Geo route must keep trailing wildcard for query strings",
  );
  assert.doesNotMatch(
    deploy,
    /`\$\{platformHost\}\/\*`/,
    "Geo routing must never hijack the whole shared boss domain",
  );
  assert.match(
    deploy,
    /if \(mode === "client" && sharedDomainRoutes\.length\)/,
  );
  assert.match(deploy, /delete config\.routes/);
});
