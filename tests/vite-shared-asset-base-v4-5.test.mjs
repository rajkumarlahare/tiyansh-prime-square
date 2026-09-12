import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = new URL(
      `${encodeURIComponent(entry.name)}${entry.isDirectory() ? "/" : ""}`,
      directory,
    );
    if (entry.isDirectory()) files.push(...(await listFiles(child)));
    else files.push(child);
  }
  return files;
}

test("Vite build uses the native isolated Rekixo asset base", async () => {
  const [viteConfig, nextConfig, buildScript] = await Promise.all([
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/build-verified.sh", import.meta.url), "utf8"),
  ]);

  assert.match(viteConfig, /base:\s*"\/__rekixo\/"/);
  assert.match(nextConfig, /assetPrefix:\s*"\/__rekixo"/);
  assert.match(buildScript, /verify-shared-asset-build\.mjs/);
});

test("built client cannot escape to root framework asset namespaces", async () => {
  const clientRoot = new URL("../dist/client/", import.meta.url);
  const files = (await listFiles(clientRoot)).filter((file) =>
    /\.(?:js|mjs|css|html|json)$/.test(file.pathname),
  );
  assert.ok(files.length > 0, "dist/client text assets missing");

  const forbiddenRootAsset =
    /(^|[\s"'`()=,:;])\/(?:assets|_next|_vinext)\//m;
  let prefixedReferenceCount = 0;

  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (content.includes("/__rekixo/")) prefixedReferenceCount += 1;
    assert.doesNotMatch(
      content,
      forbiddenRootAsset,
      `${file.pathname} escaped the Rekixo asset namespace`,
    );
    assert.doesNotMatch(
      content,
      /\/__rekixo\/__rekixo\//,
      `${file.pathname} contains a doubled Rekixo prefix`,
    );
  }

  assert.ok(
    prefixedReferenceCount > 0,
    "production build contains no /__rekixo/ asset references",
  );
});

test("native asset base does not widen shared boss-domain ownership", async () => {
  const deploy = await readFile(
    new URL("../scripts/prepare-cloudflare-deploy.mjs", import.meta.url),
    "utf8",
  );

  assert.match(deploy, /`\$\{platformHost\}\/__rekixo\/\*`/);
  assert.doesNotMatch(deploy, /`\$\{platformHost\}\/assets\/\*`/);
  assert.doesNotMatch(deploy, /`\$\{platformHost\}\/\*`/);
});
