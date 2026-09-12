import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [dashboard, manager, route, publicRoute, page, clientPolicy, schema, three] = await Promise.all([
  read("app/super-admin-dashboard.tsx"),
  read("app/project-status-theme-manager.tsx"),
  read("app/api/admin/project-status-theme/route.ts"),
  read("app/api/public-data/route.ts"),
  read("public/project/index.html"),
  read("app/client-admin-policy.ts"),
  read("db/schema.ts"),
  read("public/project/three-view.js"),
]);

test("Super Admin gets project-scoped 2D status color controls", () => {
  assert.match(dashboard, /ProjectStatusThemeManager/);
  assert.match(dashboard, /key=\{`status-theme:\$\{projectId\}`\}/);
  assert.match(manager, /type="color"/);
  assert.match(manager, /Color code/);
  assert.match(manager, /#12C568 or rgb\(18,197,104\)/);
  assert.match(manager, /Reset Rekixo defaults/);
  assert.match(manager, /3D rendering unchanged/);
});

test("status theme API is explicit-project, Super-Admin-only and audited", () => {
  assert.match(route, /requireSuperAdmin\(\)/);
  assert.match(route, /sameOrigin\(request\)/);
  assert.match(route, /SELECT id,name FROM projects WHERE id=\?/);
  assert.match(route, /WHERE project_id=\? AND key IN \(\?,\?,\?\)/);
  assert.match(route, /project\.status_theme_updated/);
  assert.match(route, /writeAudit\(actor/);
  assert.match(route, /DELETE FROM settings WHERE project_id=\? AND key=\?/);
  assert.match(route, /ON CONFLICT\(project_id,key\) DO UPDATE/);
});

test("theme uses existing project settings table without schema migration", () => {
  assert.match(schema, /export const settings = sqliteTable\("settings"/);
  assert.match(schema, /primaryKey\(\{columns:\[table\.projectId,table\.key\]\}\)/);
  assert.doesNotMatch(schema, /plotStatusAvailableColor/);
});

test("client admin cannot mutate Super Admin status theme keys", () => {
  assert.match(clientPolicy, /CLIENT_EDITABLE_SETTING_KEYS = PROJECT_CONTACT_KEYS/);
  assert.doesNotMatch(clientPolicy, /plotStatusAvailableColor/);
  assert.doesNotMatch(clientPolicy, /plotStatusBookedColor/);
  assert.doesNotMatch(clientPolicy, /plotStatusSoldColor/);
});

test("public payload exposes only the three explicit project theme settings", () => {
  assert.match(publicRoute, /"plotStatusAvailableColor"/);
  assert.match(publicRoute, /"plotStatusBookedColor"/);
  assert.match(publicRoute, /"plotStatusSoldColor"/);
  assert.match(publicRoute, /PUBLIC_SETTING_KEYS/);
});

test("public 2D runtime applies project theme through CSS variables", () => {
  assert.match(page, /REKIXO_PROJECT_STATUS_THEME_V1/);
  assert.match(page, /--plot-available-rgb:18,197,104/);
  assert.match(page, /--plot-booked-rgb:245,181,22/);
  assert.match(page, /--plot-sold-rgb:240,49,76/);
  assert.match(page, /function applyPlotStatusTheme\(settings=\{\}\)/);
  assert.match(page, /plotStatusAvailableColor/);
  assert.match(page, /applyPlotStatusTheme\(s\)/);
});

test("STATUS toggle stays visible while selected polygon keeps stronger tint", () => {
  assert.match(page, /\.show-all \.plot\[data-status="available"\]\{fill:rgba\(var\(--plot-available-rgb\),\.26\)/);
  assert.match(page, /\.show-all \.plot\.selected\[data-status="available"\][\s\S]*fill:rgba\(var\(--plot-available-rgb\),\.36\)/);
  assert.match(page, /\.show-all \.plot\.selected\[data-status="booked"\][\s\S]*fill:rgba\(var\(--plot-booked-rgb\),\.38\)/);
  assert.match(page, /\.show-all \.plot\.selected\[data-status="sold"\][\s\S]*fill:rgba\(var\(--plot-sold-rgb\),\.38\)/);
});

test("3D engine remains independent from project 2D status theme", () => {
  assert.doesNotMatch(three, /plotStatusAvailableColor/);
  assert.doesNotMatch(three, /plotStatusBookedColor/);
  assert.doesNotMatch(three, /plotStatusSoldColor/);
});
