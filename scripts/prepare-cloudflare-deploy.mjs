import { readFile, writeFile } from "node:fs/promises";

const path = "dist/server/wrangler.json";
const config = JSON.parse(await readFile(path, "utf8"));

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
console.log("Prepared generated Wrangler config with unique production bindings.");
