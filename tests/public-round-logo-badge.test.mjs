import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const site = await readFile(new URL("../public/project/index.html", import.meta.url), "utf8");

test("header logo is rendered as a circle without visible square framing", () => {
  assert.match(site, /\.brandmark\{overflow:hidden;border-radius:999px !important\}/);
  assert.match(site, /\.brandmark \.project-logo\{[^\n]*object-fit:cover/);
  assert.match(site, /padding:0 !important/);
  assert.match(site, /background:transparent !important/);
});

test("mini floating badge can show uploaded project logo instead of short text", () => {
  assert.match(site, /badgeButton\.classList\.add\('has-project-logo'\)/);
  assert.match(site, /miniProjectLogo\.className='mini-project-logo'/);
  assert.match(site, /miniProjectLogo\.src='\/api\/project-asset\/logo'/);
  assert.match(site, /\.mini-logo\.has-project-logo strong,\.mini-logo\.has-project-logo span,\.mini-logo\.has-project-logo small\{display:none !important\}/);
});
