import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(
  new URL("../public/project/index.html", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL("../drizzle/0007_project_share_metadata.sql", import.meta.url),
  "utf8",
);

test("round header logo and mini logo badge are present", () => {
  assert.match(html, /circular header logo \+ mini badge logo only/);
  assert.match(
    html,
    /\.brandmark\{overflow:hidden;border-radius:999px !important\}/,
  );
  assert.match(html, /miniProjectLogo\.className='mini-project-logo'/);
  assert.match(html, /badgeButton\.classList\.add\('has-project-logo'\)/);
});

test("Gallery and Location buttons stay compact", () => {
  assert.match(
    html,
    /\.pill\{width:118px;height:40px;padding:0 10px;border-radius:12px/,
  );
  assert.match(html, /\.pill \.pin\{width:14px;height:17px/);
  assert.match(html, /\.pill \.gallery\{width:14px;height:14px/);
});

test("RPK share/contact data is tenant scoped, not baked into generic HTML", async () => {
  assert.doesNotMatch(
    html,
    /og:title" content="Shree Banashankari Nagara"/,
  );
  assert.doesNotMatch(
    html,
    /og:image" content="\/rpk-share-card\.png"/,
  );
  assert.doesNotMatch(html, /95386 02461/);

  assert.match(migration, /'shareTitle', 'Shree Banashankari Nagara'/);
  assert.match(migration, /'shareImage', '\/rpk-share-card\.png'/);
  assert.match(migration, /'phone1', '\+91 95386 02461'/);
  assert.match(migration, /'whatsapp', '\+91 95386 02461'/);

  await access(new URL("../public/rpk-share-card.png", import.meta.url));
});

test("WhatsApp and Call Now enhancer is generic and normalizes numbers", () => {
  assert.match(html, /https:\/\/wa\.me\//);
  assert.match(html, /tel:\+/);
  assert.match(html, /data-rekixo-wa/);
  assert.match(html, /data-rekixo-call/);
  assert.match(html, /replace\(\/\\D\+\/g,\s*""\)/);
  assert.doesNotMatch(html, /95386 02461/);
});
