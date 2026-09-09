import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(
  new URL("../public/project/index.html", import.meta.url),
  "utf8",
);

test("customer project bootstrap retries transient public-data failures", () => {
  assert.match(html, /REKIXO_PUBLIC_BOOT_RESILIENCE_V2/);
  assert.match(html, /const REKIXO_BOOT_DELAYS=\[0,450,1400,2800\];/);
  assert.match(html, /const REKIXO_BOOT_TIMEOUT_MS=8000;/);
  assert.match(html, /new AbortController\(\)/);
  assert.match(html, /signal:controller\.signal/);
  assert.match(html, /cache:'no-store'/);
  assert.match(html, /headers:\{accept:'application\/json'\}/);
});

test("bootstrap retries only transient HTTP classes and does not loop permanent 404", () => {
  assert.match(
    html,
    /status===0\|\|status===408\|\|status===425\|\|status===429\|\|status>=500/,
  );
  assert.match(html, /if\(status&&!rekixoBootRetryableStatus\(status\)\)break;/);
  assert.match(html, /const message=status===404/);
});

test("bootstrap has one in-flight run, timeout abort and stale-run protection", () => {
  assert.match(html, /let REKIXO_BOOT_RUN=0;/);
  assert.match(html, /let REKIXO_BOOT_CONTROLLER=null;/);
  assert.match(html, /if\(REKIXO_BOOT_CONTROLLER\)REKIXO_BOOT_CONTROLLER\.abort\(\);/);
  assert.match(html, /setTimeout\(\(\)=>controller\.abort\(\),REKIXO_BOOT_TIMEOUT_MS\)/);
  assert.match(html, /if\(run!==REKIXO_BOOT_RUN\)return;/);
});

test("manual Retry and browser online recovery are both wired", () => {
  assert.match(html, /id="rekixoBootRetry"/);
  assert.match(
    html,
    /rekixoBootRetryButton\.addEventListener\('click',\(\)=>rekixoStartPublicBoot\(\)\)/,
  );
  assert.match(html, /window\.REKIXO_RETRY_PUBLIC_BOOT=\(\)=>rekixoStartPublicBoot\(\);/);
  assert.match(html, /window\.addEventListener\('online'/);
});

test("data-application exceptions are not mistaken for network failures", () => {
  assert.match(html, /try\{\s*rekixoApplyPublicData\(data\);\s*\}catch\(applyError\)/s);
  assert.match(html, /console\.error\('Project data apply failed',applyError\)/);
});

test("legacy single-shot fatal bootstrap is removed", () => {
  assert.doesNotMatch(
    html,
    /fetch\('\/api\/public-data'\+REKIXO_PROJECT_QUERY,\{cache:'no-store'\}\)\.then/,
  );
  assert.doesNotMatch(
    html,
    /\.catch\(\(\)=>\{document\.documentElement\.classList\.remove\('rekixo-project-loading'\)/,
  );
});

test("bootstrap hardening leaves map geometry and controls untouched", () => {
  assert.match(html, /function pointInPolygon\(/);
  assert.match(html, /matrixTransform\(ctm\.inverse\(\)\)/);
  assert.match(html, /id="amenitiesBtn"/);
  assert.match(html, /id="galleryBtn"/);
  assert.match(html, /id="locationBtn"/);
});
