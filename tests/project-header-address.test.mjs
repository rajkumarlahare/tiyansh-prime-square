import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mapper = await readFile(
  new URL("../app/plot-mapper.tsx", import.meta.url),
  "utf8",
);
const route = await readFile(
  new URL("../app/api/super-mapper/route.ts", import.meta.url),
  "utf8",
);
const publicData = await readFile(
  new URL("../app/api/public-data/route.ts", import.meta.url),
  "utf8",
);
const site = await readFile(
  new URL("../public/project/index.html", import.meta.url),
  "utf8",
);

test("Super Admin Plot Mapper can save a website header address", () => {
  assert.match(mapper, /const \[headerAddress, setHeaderAddress\] = useState\(""\)/);
  assert.match(mapper, /async function saveHeaderAddress\(\)/);
  assert.match(mapper, /persistMapperSettings\(\{ address: value \}\)/);
  assert.match(mapper, /Website header subtitle \/ address/);
  assert.match(mapper, /placeholder="Example: MALE, RATNAGIRI"/);
});

test("Super Mapper allows only a validated short address setting", () => {
  assert.match(route, /"address",\n\]\);/);
  assert.match(route, /if \(key === "address"\)/);
  assert.match(route, /value\.length > 180/);
});

test("public API exposes address and customer site renders it below title", () => {
  assert.match(publicData, /"address"/);
  assert.match(site, /const resolvedAddress=String\(s\.address\|\|resolvedLocation\)\.trim\(\)/);
  assert.match(
    site,
    /location\.textContent=\(resolvedAddress\|\|PROJECT_LOCATION\)\.toUpperCase\(\)/,
  );
});

test("header address save path is settings-only and does not submit plot geometry", () => {
  const start = mapper.indexOf("async function saveHeaderAddress()");
  const end = mapper.indexOf("async function reload()", start);
  assert.ok(start >= 0 && end > start, "saveHeaderAddress function should exist");
  const saveAddressBody = mapper.slice(start, end);
  assert.match(saveAddressBody, /persistMapperSettings\(\{ address: value \}\)/);
  assert.doesNotMatch(saveAddressBody, /polygon|savePlots|\/api\/plots/i);

  const addressStart = route.indexOf('if (key === "address")');
  const rotationStart = route.indexOf('if (key === "publicRotation")', addressStart);
  assert.ok(addressStart >= 0 && rotationStart > addressStart, "address validator should exist");
  const addressValidator = route.slice(addressStart, rotationStart);
  assert.doesNotMatch(addressValidator, /plots|polygon/i);
});
