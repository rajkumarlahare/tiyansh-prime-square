import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mapper = readFileSync(
  new URL("../app/geo-mapper.tsx", import.meta.url),
  "utf8",
);
const visual = readFileSync(
  new URL("../app/geo-visual-calibration.tsx", import.meta.url),
  "utf8",
);
const guard = readFileSync(
  new URL("../app/geo-visual-calibration-guard.tsx", import.meta.url),
  "utf8",
);

test("configured Maps key does not auto-load Google Maps on Geo Mapper entry", () => {
  assert.match(visual, /const \[satelliteRequested, setSatelliteRequested\] = useState\(false\)/);
  assert.match(
    visual,
    /if \(\s*!satelliteRequested \|\|\s*!config\?\.lab \|\|\s*!config\.mapsEnabled \|\|\s*!config\.apiKey \|\|\s*!mapNodeRef\.current\s*\) return;/s,
  );
  assert.match(visual, /Load Google Satellite/);
});

test("saving or clearing a Maps key returns Satellite to explicit-load state", () => {
  const resets = visual.match(/setSatelliteRequested\(false\)/g) || [];
  assert.ok(resets.length >= 2);
  assert.match(visual, /Maps key save ho gayi\. Ab `Load Google Satellite` dabayein\./);
});

test("Google Satellite runtime is isolated from the rest of Geo Mapper", () => {
  assert.match(mapper, /GeoVisualCalibrationGuard/);
  assert.match(mapper, /<GeoVisualCalibrationGuard/);
  assert.match(guard, /getDerivedStateFromError/);
  assert.match(guard, /componentDidCatch/);
  assert.match(guard, /manual control-point fields/);
});
