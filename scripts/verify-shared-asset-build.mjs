import { readFile, readdir } from "node:fs/promises";
import { extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = fileURLToPath(new URL("../dist/client/", import.meta.url));
const textualExtensions = new Set([".js", ".mjs", ".css", ".html", ".json"]);
const forbiddenRootAsset =
  /(^|[\s"'`()=,:;])\/(?:assets|_next|_vinext)\//m;
const doubledPrefix = /\/__rekixo\/__rekixo\//;

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else files.push(path);
  }
  return files;
}

const files = (await listFiles(clientRoot)).filter((file) =>
  textualExtensions.has(extname(file)),
);

if (!files.length) {
  console.error("Shared asset verification: dist/client has no text assets.");
  process.exit(1);
}

const failures = [];
let prefixedReferenceCount = 0;

for (const file of files) {
  const content = await readFile(file, "utf8");
  const display = relative(clientRoot, file);

  if (content.includes("/__rekixo/")) prefixedReferenceCount += 1;

  if (forbiddenRootAsset.test(content)) {
    failures.push(
      `${display}: unprefixed framework asset reference (/assets, /_next or /_vinext)`,
    );
  }
  if (doubledPrefix.test(content)) {
    failures.push(`${display}: duplicated /__rekixo/__rekixo asset prefix`);
  }
}

if (prefixedReferenceCount === 0) {
  failures.push(
    "dist/client: no /__rekixo/ asset reference found; Vite base may not be active",
  );
}

if (failures.length) {
  console.error("Rekixo shared asset namespace verification failed:");
  for (const failure of failures.slice(0, 20)) console.error(` - ${failure}`);
  if (failures.length > 20)
    console.error(` - ...and ${failures.length - 20} more`);
  process.exit(1);
}

console.log(
  `Rekixo shared asset namespace verified across ${files.length} built text assets.`,
);
