import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("server preserves accepted original image MIME instead of forcing JPEG", async () => {
  const route = await readFile(
    new URL("../app/api/admin/project-share/route.ts", import.meta.url),
    "utf8",
  );

  assert.ok(route.includes('return "image/jpeg"'));
  assert.ok(route.includes('return "image/png"'));
  assert.ok(route.includes('return "image/webp"'));
  assert.ok(route.includes("file.size > 8 * 1024 * 1024"));
  assert.ok(route.includes("httpMetadata: { contentType: detectedMime }"));
  assert.ok(!route.includes('file.type !== "image/jpeg"'));
  assert.ok(!route.includes('contentType: "image/jpeg"'));
});

test("share image path never recomposes the poster into a fixed AR3D canvas", async () => {
  const manager = await readFile(
    new URL("../app/project-share-manager.tsx", import.meta.url),
    "utf8",
  );

  const start = manager.indexOf("async function saveShareImage()");
  const end = manager.indexOf("async function copyLink()", start);

  assert.ok(start >= 0, "saveShareImage() missing");
  assert.ok(end > start, "copyLink() anchor missing");

  const shareUploadFlow = manager.slice(start, end);

  // The share-poster path must upload the user's chosen file directly.
  assert.ok(shareUploadFlow.includes('form.set("file", shareImageFile)'));
  assert.ok(shareUploadFlow.includes('form.set("shareTemplate", SHARE_TEMPLATE)'));
  assert.ok(!shareUploadFlow.includes("canvas"));
  assert.ok(!shareUploadFlow.includes("toBlob"));
  assert.ok(!shareUploadFlow.includes("toDataURL"));
  assert.ok(!shareUploadFlow.includes("drawCover"));
  assert.ok(!shareUploadFlow.includes("drawContain"));
  assert.ok(!shareUploadFlow.includes("INTERACTIVE PROJECT PREVIEW"));

  // toBlob is intentionally allowed elsewhere: project-logo optimization remains separate.
  const logoStart = manager.indexOf("async function prepareProjectLogo");
  const logoEnd = manager.indexOf("function validateShareImage", logoStart);
  assert.ok(logoStart >= 0 && logoEnd > logoStart, "logo optimizer anchors missing");
  const logoFlow = manager.slice(logoStart, logoEnd);
  assert.ok(logoFlow.includes("canvas.toBlob"));
});

test("share UI uses natural poster preview and keeps project logo independent", async () => {
  const [manager, css] = await Promise.all([
    readFile(new URL("../app/project-share-manager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/super-mapper.css", import.meta.url), "utf8"),
  ]);

  assert.ok(manager.includes("SHARE IMAGE / WHATSAPP POSTER"));
  assert.ok(manager.includes("original aspect ratio · no crop"));
  assert.ok(manager.includes("Original share image save ho gayi"));
  assert.ok(manager.includes("Upload / replace logo"));
  assert.ok(css.includes("object-fit:contain"));
  assert.ok(!css.includes("aspect-ratio:1200/630"));
});
