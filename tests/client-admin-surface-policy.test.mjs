import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("client settings policy consumes one canonical project-contact allowlist and excludes technical metadata", async () => {
  const [policy,profile] = await Promise.all([
    source("../app/client-admin-policy.ts"),
    source("../app/project-profile-policy.ts"),
  ]);
  assert.match(policy, /CLIENT_EDITABLE_SETTING_KEYS = PROJECT_CONTACT_KEYS/);
  for (const key of ["location","address","phone1","phone2","whatsapp","mapUrl","brochureUrl"]) {
    assert.ok(profile.includes(`"${key}"`), `missing canonical contact key ${key}`);
  }
  for (const key of ["cadBounds","homography","mapWidth","mapHeight","plotSheetName","sourceCadName","shareVersion","shareTemplate","shareImage"]) {
    assert.equal(profile.includes(`"${key}"`), false, `technical key leaked into project profile: ${key}`);
  }
  for (const key of ["brandName","brandShort","accentColor","logoName","logoVersion"]) {
    assert.ok(policy.includes(`"${key}"`), `missing read-only branding key ${key}`);
  }
});

test("client dashboard renders only explicit contact fields and status-only plot controls", async () => {
  const dashboard = await source("../app/admin-dashboard.tsx");
  assert.match(dashboard, /CLIENT_EDITABLE_SETTING_KEYS/);
  assert.doesNotMatch(dashboard, /Object\.entries\(settings\)/);
  assert.match(dashboard, /Contact & Location/);
  assert.match(dashboard, /type:"plotStatus"/);
  assert.match(dashboard, /selected&&user\.role==="super_admin"/);
  assert.match(dashboard, /type:"settingsPatch",changes/);
  assert.match(dashboard, /savedClientSettings/);
});

test("client data API filters reads and rejects unauthorized settings/full plot edits", async () => {
  const route = await source("../app/api/data/route.ts");
  assert.match(route, /pickClientVisibleSettings/);
  assert.match(route, /isClientEditableSettingKey/);
  assert.match(route, /body\.type === "plotStatus"/);
  assert.match(route, /validClientPlotStatus/);
  assert.match(route, /Client can update plot status only/);
  assert.match(route, /Client setting not allowed/);
});

test("public project API strips internal plot notes", async () => {
  const route = await source("../app/api/public-data/route.ts");
  assert.match(route, /const \{ notes, \.\.\.publicPlot \} = plot/);
  assert.match(route, /void notes/);
  assert.match(route, /return publicPlot/);
});

test("mandatory password change reuses resilient auth UI and project identity", async () => {
  const [form,page,critical] = await Promise.all([
    source("../app/admin/change-password/password-form.tsx"),
    source("../app/projects/[slug]/change-password/page.tsx"),
    source("../app/admin/login/login-critical.ts"),
  ]);
  assert.match(form, /LOGIN_CRITICAL_CSS/);
  assert.match(form, /data-rekixo-login-critical/);
  assert.match(form, /className="login-card"/);
  assert.match(form, /className="login-input"/);
  assert.match(form, /className="login-submit"/);
  assert.match(form, /projectName/);
  assert.match(page, /projectName=\{project\.name\}/);
  assert.match(critical, /\.login-hint/);
});

test("Super Admin mapper/share and core auth boundaries remain separate", async () => {
  const [mapper,share,auth] = await Promise.all([
    source("../app/api/super-mapper/route.ts"),
    source("../app/api/admin/project-share/route.ts"),
    source("../app/admin-auth.ts"),
  ]);
  assert.match(mapper, /requireSuperAdmin/);
  assert.match(mapper, /Super Admin access required/);
  assert.match(share, /requireSuperAdmin/);
  assert.match(share, /Super Admin access required/);
  assert.match(auth, /PBKDF2/);
  assert.match(auth, /iterations:100000/);
});
