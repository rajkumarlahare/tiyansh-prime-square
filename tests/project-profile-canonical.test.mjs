import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("one canonical contact profile powers Super Admin and Client Admin", async () => {
  const [policy,clientPolicy,superUi,clientUi] = await Promise.all([
    source("../app/project-profile-policy.ts"),
    source("../app/client-admin-policy.ts"),
    source("../app/project-profile-manager.tsx"),
    source("../app/admin-dashboard.tsx"),
  ]);
  assert.match(clientPolicy, /CLIENT_EDITABLE_SETTING_KEYS = PROJECT_CONTACT_KEYS/);
  assert.match(superUi, /PROJECT_CONTACT_KEYS/);
  assert.match(superUi, /\/api\/admin\/project-profile/);
  assert.match(clientUi, /PROJECT_CONTACT_LABELS/);
  assert.match(clientUi, /type:"settingsPatch",changes/);
  assert.match(clientUi, /Super Admin me saved project profile yahan pre-filled hai/);
  for (const key of ["location","address","phone1","phone2","whatsapp","mapUrl","brochureUrl"]) {
    assert.match(policy, new RegExp(`"${key}"`));
  }
});

test("Super Admin project profile API is project-scoped, partial and audited", async () => {
  const route = await source("../app/api/admin/project-profile/route.ts");
  assert.match(route, /requireSuperAdmin/);
  assert.match(route, /sameOrigin/);
  assert.match(route, /validateProjectContactPatch/);
  assert.match(route, /ON CONFLICT\(project_id,key\)/);
  assert.match(route, /project\.profile_updated/);
  assert.doesNotMatch(route, /homography|cadBounds|shareImage|sourceCadName/);
});

test("client contact saves cannot stale-overwrite untouched fields", async () => {
  const [dashboard,route] = await Promise.all([
    source("../app/admin-dashboard.tsx"),
    source("../app/api/data/route.ts"),
  ]);
  assert.match(dashboard, /savedClientSettings/);
  assert.match(dashboard, /filter\(key=>String\(editable\[key\]/);
  assert.match(dashboard, /type:"settingsPatch",changes/);
  assert.match(route, /body\.type === "settingsPatch"/);
  assert.match(route, /validateProjectContactPatch/);
  assert.match(route, /Client setting not allowed/);
});

test("public site gets safe contact fallbacks without mutating canonical storage", async () => {
  const [policy,publicRoute] = await Promise.all([
    source("../app/project-profile-policy.ts"),
    source("../app/api/public-data/route.ts"),
  ]);
  assert.match(policy, /if \(!next\.whatsapp && next\.phone1\) next\.whatsapp = next\.phone1/);
  assert.match(policy, /google\.com\/maps\/search/);
  assert.match(publicRoute, /withProjectContactFallbacks/);
  assert.match(publicRoute, /effectivePublicSettings/);
});

test("publish readiness includes minimum customer contact data", async () => {
  const [route,panel] = await Promise.all([
    source("../app/api/admin/publish/route.ts"),
    source("../app/project-publish-panel.tsx"),
  ]);
  assert.match(route, /missingRequiredProjectContact/);
  assert.match(route, /Project location required/);
  assert.match(route, /Full address required/);
  assert.match(route, /Primary phone required/);
  assert.match(panel, /rekixo:project-profile-updated/);
});

test("Super Admin exposes reusable Project Profile workspace for every project", async () => {
  const dashboard = await source("../app/super-admin-dashboard.tsx");
  assert.match(dashboard, /type WorkspaceTab = [^;]*"profile"/);
  assert.match(dashboard, /<ContactRound \/> Project Profile/);
  assert.match(dashboard, /<ProjectProfileManager/);
  assert.match(dashboard, /<ProjectPublishPanel projectId=\{projectId\}/);
});
