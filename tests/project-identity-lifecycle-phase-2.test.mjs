import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [migration, schema, users, provisioning, geoLab, geoUi, publish, domains, manager] =
  await Promise.all([
    source("../drizzle/0013_rekixo_project_identity_lifecycle.sql"),
    source("../db/schema.ts"),
    source("../app/api/admin/users/route.ts"),
    source("../app/project-provisioning.ts"),
    source("../app/api/super-geo-lab/route.ts"),
    source("../app/geo-lab-clone.tsx"),
    source("../app/api/admin/publish/route.ts"),
    source("../app/api/admin/domains/route.ts"),
    source("../app/client-admin-manager.tsx"),
  ]);

test("projects have explicit kind and recoverable deletion metadata", () => {
  assert.match(migration, /ADD COLUMN kind TEXT NOT NULL DEFAULT 'customer'/);
  assert.match(migration, /ADD COLUMN deleted_at TEXT/);
  assert.match(migration, /SET kind='geo_lab'/);
  assert.match(schema, /kind:text\("kind"\)\.notNull\(\)\.default\("customer"\)/);
  assert.match(schema, /deletedAt:text\("deleted_at"\)/);
});

test("membership foundation backfills current admins and new provisioning mirrors membership", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS project_memberships/);
  assert.match(migration, /PRIMARY KEY\(user_id,project_id\)/);
  assert.match(migration, /SELECT id,project_id,role,status,1,created_at,updated_at\s+FROM admin_users/);
  assert.match(schema, /projectMemberships/);
  assert.match(provisioning, /INSERT INTO project_memberships/);
  const membership = provisioning.indexOf("INSERT INTO project_memberships");
  const commit = provisioning.indexOf("await env.DB.batch(statements)");
  assert.ok(membership >= 0 && commit > membership);
});

test("Geo Lab identity is structural, not project-name based", () => {
  assert.doesNotMatch(geoLab, /LAB_NAME/);
  assert.doesNotMatch(geoUi, /isNamedLab/);
  assert.match(geoLab, /source\.kind === "geo_lab"/);
  assert.match(geoLab, /UPDATE projects SET kind='geo_lab'/);
  assert.match(publish, /project\.kind === "geo_lab"/);
  assert.match(domains, /kind='geo_lab'/);
});

test("last-admin removal archives project without destructive R2 or project-data purge", () => {
  assert.doesNotMatch(users, /BUCKET\.delete\(object\.key\)/);
  assert.doesNotMatch(users, /DELETE FROM gallery WHERE project_id/);
  assert.doesNotMatch(users, /DELETE FROM plots WHERE project_id/);
  assert.doesNotMatch(users, /DELETE FROM settings WHERE project_id/);
  assert.match(users, /status='deleted',deleted_at=\?/);
  assert.match(users, /UPDATE admin_users SET status='disabled'/);
  assert.match(users, /UPDATE project_domains SET status='disabled'/);
  assert.match(users, /UPDATE project_memberships SET status='disabled'/);
  assert.match(users, /recoverable:true/);
});

test("archived projects have an explicit restore path that stays domainless and access-disabled", () => {
  assert.match(users, /action==="restore_project"/);
  assert.match(users, /status='active',deleted_at=NULL/);
  assert.match(users, /archivedProjects/);
  assert.match(manager, /Recoverable projects/);
  assert.match(manager, /action:"restore_project"/);
  assert.match(manager, /Project restored; admin access dobara enable karein/);
  const restoreSlice = users.slice(
    users.indexOf('if(action==="restore_project")'),
    users.indexOf('const current=await env.DB.prepare'),
  );
  assert.doesNotMatch(restoreSlice, /UPDATE project_domains SET status='active'/);
  assert.doesNotMatch(restoreSlice, /UPDATE admin_users SET status='active'/);
});

test("staff toggle mirrors compatibility membership status without changing auth semantics", () => {
  const toggle = users.slice(
    users.indexOf('if(action==="toggle")'),
    users.indexOf('if(action==="domains")'),
  );
  assert.match(toggle, /UPDATE project_memberships SET status=\?/);
  assert.match(toggle, /session_version=session_version\+1/);
});
