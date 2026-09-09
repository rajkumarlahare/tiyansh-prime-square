import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../public/project/index.html", import.meta.url), "utf8");

test("Gallery and Location buttons stay compact after the additional 3 percent width trim", () => {
  assert.match(page, /\.pill\{width:114\.5px;height:40px/);
  assert.match(page, /\.pill\{width:144\.5px;height:49px/);
  assert.match(page, /\.pill \.pin\{width:14px;height:17px/);
  assert.match(page, /\.pill \.gallery\{width:14px;height:14px/);
});

test("button functionality and ids remain unchanged", () => {
  assert.match(page, /id="galleryBtn"/);
  assert.match(page, /id="locationBtn"/);
});
