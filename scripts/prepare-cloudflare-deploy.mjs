import { readFile, writeFile } from "node:fs/promises";

const path = "dist/server/wrangler.json";
const config = JSON.parse(await readFile(path, "utf8"));
const mode = process.argv[2];

if (!["client", "legacy", "super"].includes(mode)) {
  throw new Error(
    "Usage: node scripts/prepare-cloudflare-deploy.mjs client|legacy|super",
  );
}

const workersSubdomain =
  String(process.env.REKIXO_WORKERS_SUBDOMAIN || "").trim() || "ai-8f3";
const genericHost = `rekixo-client-sites.${workersSubdomain}.workers.dev`;
const legacyHost = `tiyansh-prime-square.${workersSubdomain}.workers.dev`;
const platformHost = String(process.env.REKIXO_PLATFORM_HOST || "").trim();
const sharedAdminHost = String(
  process.env.REKIXO_SHARED_ADMIN_HOST || "",
).trim();

config.name =
  mode === "super"
    ? "rekixo-super-admin"
    : mode === "legacy"
      ? "tiyansh-prime-square"
      : "rekixo-client-sites";

config.vars = {
  PANEL_MODE: mode === "super" ? "super" : "client",
  SUPER_ADMIN_HOST: "admin.rekixo.com",
  CLIENT_FALLBACK_HOST: genericHost,
  LEGACY_FALLBACK_HOST: legacyHost,
  CLIENT_PLATFORM_HOST: platformHost,
  CLIENT_SHARED_ADMIN_HOST: sharedAdminHost,
  CLIENT_ADMIN_ORIGIN: sharedAdminHost
    ? `https://${sharedAdminHost}`
    : `https://${genericHost}`,
};

config.d1_databases = [
  {
    binding: "DB",
    database_name: "tiyansh-production",
    database_id: "ac37f422-3065-4bda-9f9c-16c4b818cacd",
  },
];

config.r2_buckets = [
  {
    binding: "BUCKET",
    bucket_name: "tiyansh-gallery-production",
  },
];

await writeFile(path, `${JSON.stringify(config)}\n`);
console.log(
  `Prepared ${mode} Worker: ${config.name} · shared D1/R2 · platform ${platformHost}`,
);
