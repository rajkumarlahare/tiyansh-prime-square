import assert from "node:assert/strict";
import test from "node:test";
import {
  SHARED_ASSET_PREFIX,
  isPrefixedFrameworkAssetPath,
  isSharedAssetPath,
  rewriteAssetReferences,
  shouldRewriteAssetBody,
  stripSharedAssetPath,
} from "../worker/shared-assets.mjs";

test("shared asset helpers cover HTML, CSS, RSC-style strings and Link preload headers", () => {
  const cases = [
    ['href="/_next/static/app.css"', 'href="/__rekixo/_next/static/app.css"'],
    ['</_next/static/app.css>; rel=preload; as=style', '</__rekixo/_next/static/app.css>; rel=preload; as=style'],
    ['url(/assets/font.woff2)', 'url(/__rekixo/assets/font.woff2)'],
    ['"/_vinext/image?url=%2Fhero.jpg"', '"/__rekixo/_vinext/image?url=%2Fhero.jpg"'],
    ['href="/__rekixo/_next/static/already.css"', 'href="/__rekixo/_next/static/already.css"'],
  ];
  for (const [input, expected] of cases) assert.equal(rewriteAssetReferences(input), expected, input);
});

test("shared asset path detection and stripping are deterministic", () => {
  assert.equal(SHARED_ASSET_PREFIX, "/__rekixo");
  assert.equal(isSharedAssetPath("/__rekixo"), true);
  assert.equal(isSharedAssetPath("/__rekixo/_next/static/a.js"), true);
  assert.equal(isSharedAssetPath("/projects/demo"), false);
  assert.equal(stripSharedAssetPath("/__rekixo"), "/");
  assert.equal(stripSharedAssetPath("/__rekixo/_next/static/a.js"), "/_next/static/a.js");
  assert.equal(stripSharedAssetPath("/projects/demo"), "/projects/demo");
  assert.equal(isPrefixedFrameworkAssetPath("/__rekixo/_next/static/a.js"), true);
  assert.equal(isPrefixedFrameworkAssetPath("/__rekixo/assets/a.css"), true);
  assert.equal(isPrefixedFrameworkAssetPath("/__rekixo/project/index.html"), false);
});

test("only textual response types are compatibility-rewritten", () => {
  for (const type of ["text/html; charset=utf-8", "text/css", "application/javascript", "text/x-component", "application/json"]) {
    assert.equal(shouldRewriteAssetBody(type), true, type);
  }
  assert.equal(shouldRewriteAssetBody("image/webp"), false);
  assert.equal(shouldRewriteAssetBody("font/woff2"), false);
});
