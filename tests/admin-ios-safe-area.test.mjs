import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [layout, dashboard, css] = await Promise.all([
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/admin-dashboard.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("Next viewport explicitly opts client admin into iPhone safe areas", () => {
  assert.match(layout, /import type \{ Metadata, Viewport \} from "next";/);
  assert.match(layout, /export const viewport: Viewport = \{/);
  assert.match(layout, /viewportFit: "cover"/);
});

test("client and super admin mobile nav counts are role scoped", () => {
  assert.match(dashboard, /role-super-admin/);
  assert.match(dashboard, /role-client-admin/);
  assert.match(css, /\.admin-shell\.role-client-admin \.side nav\{\s*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important;/);
  assert.match(css, /\.admin-shell\.role-super-admin \.side nav\{\s*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important;/);
});

test("admin shell uses dynamic viewport and all four iOS safe-area edges", () => {
  assert.match(css, /REKIXO_IOS_ADMIN_SAFE_AREA_V1/);
  assert.match(css, /min-height:100svh;/);
  assert.match(css, /min-height:100dvh;/);
  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /safe-area-inset-right/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /safe-area-inset-left/);
  assert.match(css, /padding-bottom:calc\(100px \+ env\(safe-area-inset-bottom,0px\)\)/);
});
