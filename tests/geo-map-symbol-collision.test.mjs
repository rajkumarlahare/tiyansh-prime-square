import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const visual = readFileSync(
  new URL("../app/geo-visual-calibration.tsx", import.meta.url),
  "utf8",
);

test("Geo diagnostics native Map is never shadowed by lucide Map icon", () => {
  const importMatch = visual.match(
    /import\s*\{([\s\S]*?)\}\s*from "lucide-react";/,
  );
  assert.ok(importMatch, "lucide-react named import missing");

  const importedBindings = importMatch[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const alias = item.split(/\s+as\s+/);
      return (alias[1] || alias[0]).trim();
    });

  assert.ok(importedBindings.includes("MapIcon"));
  assert.ok(!importedBindings.includes("Map"));

  assert.match(visual, /\bMap\s+as\s+MapIcon\b/);
  assert.match(visual, /new globalThis\.Map\(/);
  assert.match(visual, /<MapIcon \/>/);
  assert.doesNotMatch(visual, /<Map \/>/);
  assert.doesNotMatch(
    visual,
    /\(\)\s*=>\s*new Map\(\(diagnostics\?\.points/,
  );
});
