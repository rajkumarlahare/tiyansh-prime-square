import { readFile, writeFile } from "node:fs/promises";

const path = "dist/server/wrangler.json";
const config = JSON.parse(await readFile(path, "utf8"));
const mode=process.argv[2];
if(!["client","super"].includes(mode))throw new Error("Usage: node scripts/prepare-cloudflare-deploy.mjs client|super");

config.name=mode==="super"?"rekixo-super-admin":"tiyansh-prime-square";
config.vars={...(config.vars||{}),PANEL_MODE:mode,CLIENT_ADMIN_ORIGIN:"https://tiyansh-prime-square.ai-8f3.workers.dev"};

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
console.log(`Prepared ${mode} Worker with unique production bindings.`);
