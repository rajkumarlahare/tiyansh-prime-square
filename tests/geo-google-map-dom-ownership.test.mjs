import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const visual = readFileSync(
  new URL("../app/geo-visual-calibration.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("../app/geo-visual-calibration.module.css", import.meta.url),
  "utf8",
);

test("Google Maps receives a dedicated empty DOM ownership canvas", () => {
  assert.match(
    visual,
    /<div\s+ref=\{mapNodeRef\}\s+className=\{styles\.googleMapCanvas\}\s+aria-label="Google Satellite map"\s*\/>/s,
  );
  assert.doesNotMatch(
    visual,
    /<div className=\{styles\.mapStage\} ref=\{mapNodeRef\}>/,
  );
});

test("React loading and error overlays stay outside the Google-owned canvas", () => {
  assert.match(
    visual,
    /<div className=\{styles\.mapStage\}>[\s\S]*className=\{styles\.googleMapCanvas\}[\s\S]*styles\.loading[\s\S]*styles\.error[\s\S]*<\/div>/,
  );
});

test("Google map canvas fully covers the stable map stage", () => {
  assert.match(css, /\.googleMapCanvas\s*\{[\s\S]*position:\s*absolute;/);
  assert.match(css, /\.googleMapCanvas\s*\{[\s\S]*inset:\s*0;/);
  assert.match(css, /\.googleMapCanvas\s*\{[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;/);
});
