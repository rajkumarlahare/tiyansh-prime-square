import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/super-geo-lab/route.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../app/super-admin-dashboard.tsx", import.meta.url), "utf8");
const publish = readFileSync(new URL("../app/api/admin/publish/route.ts", import.meta.url), "utf8");
const domains = readFileSync(new URL("../app/api/admin/domains/route.ts", import.meta.url), "utf8");
const users = readFileSync(new URL("../app/api/admin/users/route.ts", import.meta.url), "utf8");

test("Geo Lab clone is Super Admin only and same-origin protected", () => {
  assert.match(route, /requireSuperAdmin/);
  assert.match(route, /sameOrigin/);
  assert.match(route, /CLONE TO GEO LAB/);
});

test("stable source project is read-only inside clone route", () => {
  assert.match(route, /SELECT id,polygon FROM plots WHERE project_id=\?/);
  assert.match(route, /BUCKET\.get\(sourceKey\)/);
  assert.match(route, /BUCKET\.head\(/);
  assert.doesNotMatch(route, /UPDATE\s+plots\b/i);
  assert.doesNotMatch(route, /DELETE\s+FROM\s+plots\b/i);
  assert.doesNotMatch(route, /BUCKET\.delete\(source/i);
});

test("clone destination has explicit empty-lab safety gates", () => {
  assert.match(route, /sourceProjectId === destinationProjectId/);
  assert.match(route, /LAB_NAME\.test\(destination\.name\)/);
  assert.match(route, /destination\.publicStatus !== "draft"/);
  assert.match(route, /destination\.publicHost \|\| destination\.adminHost/);
  assert.match(route, /Geo Lab plot inventory empty hona chahiye/);
  assert.match(route, /Geo Lab workspace empty hona chahiye/);
  assert.match(route, /mapper source folder empty hona chahiye/);
});

test("business state never leaks from customer source into lab plots", () => {
  assert.match(
    route,
    /SELECT \?,id,sqft,sqm,sqyd,dimensions,road,polygon,'available','',0,\? FROM plots WHERE project_id=\?/,
  );
  assert.match(route, /businessStatusCopied: false/);
  assert.match(route, /notesCopied: false/);
  assert.match(route, /domainsCopied: false/);
});

test("R2 clone writes destination keys and rolls them back on DB failure", () => {
  assert.match(
    route,
    /destinationKey = `projects\/\$\{destinationProjectId\}\/mapper\/\$\{name\}`/,
  );
  assert.match(route, /BUCKET\.put\(destinationKey/);
  assert.match(
    route,
    /Promise\.allSettled\(copiedKeys\.map\(\(key\) => env\.BUCKET\.delete\(key\)\)\)/,
  );
});

test("marked Geo Labs cannot be publicly published or assigned domains", () => {
  assert.match(publish, /geoLabMode/);
  assert.match(publish, /Geo Lab project ko public publish nahi kiya ja sakta/);
  assert.match(domains, /Geo Lab project par domain attach disabled hai/);
  assert.match(domains, /Geo Lab project par primary domain disabled hai/);
  assert.match(users, /Geo Lab project par domain attach disabled hai/);
});

test("Geo Lab clone UI is isolated to the Geo workspace", () => {
  assert.match(dashboard, /import GeoLabClone from "\.\/geo-lab-clone"/);
  assert.match(dashboard, /tab === "geo"/);
  assert.match(dashboard, /<GeoLabClone/);
  assert.match(dashboard, /<GeoMapper key=\{projectId\}/);
});
