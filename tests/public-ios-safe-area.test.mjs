import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/project/index.html", import.meta.url), "utf8");

test("public client viewport keeps iPhone safe areas without touching map geometry", () => {
  assert.match(html, /name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=yes"/);
  assert.match(html, /REKIXO_PUBLIC_IOS_SAFE_AREA_V2/);
  assert.match(html, /--safe-top:env\(safe-area-inset-top,0px\)/);
  assert.match(html, /--safe-right:env\(safe-area-inset-right,0px\)/);
  assert.match(html, /--safe-bottom:env\(safe-area-inset-bottom,0px\)/);
  assert.match(html, /--safe-left:env\(safe-area-inset-left,0px\)/);
  assert.match(html, /@supports\(height:100dvh\)\{html,body\{height:100dvh\}\}/);
  assert.match(html, /@supports\(height:100dvh\)\{\.app\{height:100dvh;min-height:100dvh\}\}/);
  assert.match(html, /\.compass,\.view-mode\{left:var\(--rekixo-hud-left\)\}/);
  assert.match(html, /\.status\{left:var\(--rekixo-hud-left\);bottom:var\(--rekixo-hud-bottom\)\}/);
  assert.match(html, /\.controls\{right:var\(--rekixo-hud-right\);bottom:var\(--rekixo-hud-bottom\)\}/);
  assert.match(html, /\.bottom-links\{right:calc\(var\(--rekixo-hud-right\) \+ var\(--rekixo-hud-control-size\) \+ var\(--rekixo-hud-column-gap\)\);bottom:var\(--rekixo-hud-bottom\)\}/);
  assert.match(html, /<svg class="hotspots" id="hotspots" viewBox="0 0 1200 2133"/);
});
