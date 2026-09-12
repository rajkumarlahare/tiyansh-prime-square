import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(
  new URL("../app/api/admin/users/route.ts", import.meta.url),
  "utf8",
);
const provisioning = await readFile(
  new URL("../app/project-provisioning.ts", import.meta.url),
  "utf8",
);

test("client creation delegates the write boundary to atomic provisioner", () => {
  assert.match(route, /provisionClientAccess/);
  assert.match(route, /createProject:\s*!body\.projectId/);
  assert.match(route, /password:\s*hash/);
  assert.doesNotMatch(
    route,
    /await env\.DB\.batch\(statements\);if\(publicHost\)await upsertPrimaryProjectDomain/,
  );
});

test("project, settings, domains and admin share one D1 batch commit boundary", () => {
  assert.match(provisioning, /INSERT INTO projects/);
  assert.match(provisioning, /INSERT INTO settings/);
  assert.match(provisioning, /INSERT INTO project_domains/);
  assert.match(provisioning, /INSERT INTO admin_users/);
  assert.match(provisioning, /INSERT INTO audit_logs/);
  assert.match(provisioning, /"client\.created"/);
  assert.match(provisioning, /await env\.DB\.batch\(statements\)/);
});

test("domain conflicts and platform-reserved hosts are checked before onboarding batch", () => {
  assert.match(provisioning, /assertDomainAvailable\(host, projectId\)/);
  assert.match(
    provisioning,
    /for \(const host of hosts\) await assertDomainAvailable\(host, projectId\)/,
  );
  const preflight = provisioning.indexOf("assertDomainAvailable(host, projectId)");
  const commit = provisioning.indexOf("await env.DB.batch(statements)");
  assert.ok(preflight >= 0 && commit > preflight);
});

test("same public and admin hostname becomes one both-kind primary domain", () => {
  assert.match(
    provisioning,
    /publicHost && adminHost && publicHost === adminHost/,
  );
  assert.match(
    provisioning,
    /kind='both'.*public_primary=1,admin_primary=1/s,
  );
});

test("new customer project starts with null legacy hosts until atomic domain statements run", () => {
  assert.match(
    provisioning,
    /VALUES \(\?,\?,\?,NULL,NULL,'customer','active',NULL,\?,\?\)/,
  );
  assert.match(
    provisioning,
    /UPDATE projects SET public_host=\?,updated_at=\? WHERE id=\?/,
  );
  assert.match(
    provisioning,
    /UPDATE projects SET admin_host=\?,updated_at=\? WHERE id=\?/,
  );
});


test("client.created audit is inside the provisioning transaction, not after commit", () => {
  assert.doesNotMatch(
    route,
    /await writeAudit\(actor,"client\.created"/,
  );
  const audit = provisioning.indexOf("INSERT INTO audit_logs");
  const commit = provisioning.indexOf("await env.DB.batch(statements)");
  assert.ok(audit >= 0 && commit > audit);
});
