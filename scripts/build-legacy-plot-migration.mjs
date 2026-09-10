#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const VALID_STATUS = new Set(["available", "booked", "sold"]);
const VALID_SPACE = new Set(["pixels", "normalized"]);

function finiteNonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function trimmed(value, limit) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, limit);
}

function cleanProjectId(value) {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id)) {
    throw new Error("--project-id invalid hai");
  }
  return id;
}

function cleanPlotId(value) {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id)) {
    throw new Error(`Plot id invalid hai: ${String(value ?? "")}`);
  }
  return id;
}

function normalizedNumber(value) {
  const rounded = Math.round(Number(value) * 1e12) / 1e12;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function parsePoints(row) {
  if (Array.isArray(row?.points)) return row.points;
  if (typeof row?.polygon === "string" && row.polygon.trim()) {
    const parsed = JSON.parse(row.polygon);
    if (Array.isArray(parsed)) return parsed;
  }
  throw new Error(`Plot ${String(row?.id ?? "?")} me points/polygon nahi mila`);
}

function sourceRows(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object" && Array.isArray(input.plots)) return input.plots;
  throw new Error("Input JSON array ya { plots: [...] } bundle hona chahiye");
}

function sourceMeta(input) {
  if (!input || Array.isArray(input) || typeof input !== "object") return {};
  return input;
}

export function normalizeLegacyPlotRows({
  input,
  sourceWidth,
  sourceHeight,
  coordinateSpace,
  initialStatus = "available",
}) {
  const meta = sourceMeta(input);
  const rows = sourceRows(input);
  const space = String(coordinateSpace || meta.coordinateSpace || "pixels").toLowerCase();
  if (!VALID_SPACE.has(space)) throw new Error("coordinateSpace pixels ya normalized hona chahiye");

  const width = Number(sourceWidth ?? meta.sourceWidth ?? meta.mapWidth);
  const height = Number(sourceHeight ?? meta.sourceHeight ?? meta.mapHeight);
  if (space === "pixels") {
    if (!Number.isFinite(width) || width < 100 || width > 10000) {
      throw new Error("Pixel bundle ke liye source width 100..10000 chahiye");
    }
    if (!Number.isFinite(height) || height < 100 || height > 10000) {
      throw new Error("Pixel bundle ke liye source height 100..10000 chahiye");
    }
  }

  const status = String(initialStatus).toLowerCase();
  if (!VALID_STATUS.has(status)) throw new Error("initial status available/booked/sold hona chahiye");
  if (!rows.length) throw new Error("Input me plots nahi hain");
  if (rows.length > 2000) throw new Error("Ek project me adhiktam 2000 plots import karein");

  const ids = new Set();
  return rows.map((row, rowIndex) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`Plot row ${rowIndex + 1} invalid hai`);
    }
    const id = cleanPlotId(row.id);
    if (ids.has(id)) throw new Error(`Duplicate plot id: ${id}`);
    ids.add(id);

    const rawPoints = parsePoints(row);
    if (rawPoints.length < 3 || rawPoints.length > 80) {
      throw new Error(`Plot ${id} me 3..80 points chahiye`);
    }

    const points = rawPoints.map((point, pointIndex) => {
      if (!Array.isArray(point) || point.length !== 2) {
        throw new Error(`Plot ${id} point ${pointIndex + 1} invalid hai`);
      }
      const x = Number(point[0]);
      const y = Number(point[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error(`Plot ${id} point ${pointIndex + 1} finite number nahi hai`);
      }

      if (space === "normalized") {
        if (x < 0 || x > 1 || y < 0 || y > 1) {
          throw new Error(`Plot ${id} normalized point 0..1 ke bahar hai`);
        }
        return [normalizedNumber(x), normalizedNumber(y)];
      }

      if (x < 0 || x > width || y < 0 || y > height) {
        throw new Error(`Plot ${id} pixel point source bounds ke bahar hai`);
      }
      return [normalizedNumber(x / width), normalizedNumber(y / height)];
    });

    const uniquePoints = new Set(points.map(([x, y]) => `${x},${y}`));
    if (uniquePoints.size < 3) throw new Error(`Plot ${id} me kam se kam 3 unique points chahiye`);

    let sqft = finiteNonNegative(row.sqft, NaN);
    let sqm = finiteNonNegative(row.sqm, NaN);
    let sqyd = finiteNonNegative(row.sqyd, NaN);
    if (!Number.isFinite(sqft) && Number.isFinite(sqm)) sqft = sqm * 10.7639104167;
    if (!Number.isFinite(sqft) && Number.isFinite(sqyd)) sqft = sqyd * 9;
    if (!Number.isFinite(sqft)) sqft = 0;
    if (!Number.isFinite(sqm)) sqm = sqft / 10.7639104167;
    if (!Number.isFinite(sqyd)) sqyd = sqft / 9;

    return {
      id,
      sqft: normalizedNumber(sqft),
      sqm: normalizedNumber(sqm),
      sqyd: normalizedNumber(sqyd),
      dimensions: trimmed(row.dimensions, 120),
      road: trimmed(row.road ?? row.facing, 160),
      polygon: JSON.stringify(points),
      status,
      notes: trimmed(row.notes, 2000),
      featured: row.featured ? 1 : 0,
    };
  });
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error("SQL numeric value invalid hai");
  return String(Math.round(number * 1e12) / 1e12);
}

export function buildLegacyPlotMigrationSql({
  projectId,
  rows,
  sourceWidth,
  sourceHeight,
  coordinateSpace = "pixels",
  sourceLabel = "legacy-pixel-map-v1",
  inputName = "legacy-plots.json",
}) {
  const id = cleanProjectId(projectId);
  if (!Array.isArray(rows) || !rows.length) throw new Error("Normalized rows required hain");
  const space = String(coordinateSpace).toLowerCase();
  if (!VALID_SPACE.has(space)) throw new Error("coordinateSpace invalid hai");

  const width = Number(sourceWidth);
  const height = Number(sourceHeight);
  const hasDimensions = Number.isFinite(width) && Number.isFinite(height) && width >= 100 && height >= 100;
  const lines = [
    "-- AUTO-GENERATED. Source: scripts/build-legacy-plot-migration.mjs",
    `-- Project: ${id}`,
    `-- Input: ${path.basename(String(inputName || "legacy-plots.json"))}`,
    `-- Coordinate space: ${space}${hasDimensions ? ` (${Math.round(width)} x ${Math.round(height)})` : ""}`,
    "-- Safety: existing status, notes and featured fields are intentionally preserved on conflict.",
    "PRAGMA foreign_keys=ON;",
    "",
  ];

  for (const row of rows) {
    lines.push(
      "INSERT INTO `plots` (`project_id`,`id`,`sqft`,`sqm`,`sqyd`,`dimensions`,`road`,`polygon`,`status`,`notes`,`featured`,`updated_at`) VALUES (" +
        [
          sqlText(id),
          sqlText(row.id),
          sqlNumber(row.sqft),
          sqlNumber(row.sqm),
          sqlNumber(row.sqyd),
          sqlText(row.dimensions),
          sqlText(row.road),
          sqlText(row.polygon),
          sqlText(row.status),
          sqlText(row.notes),
          row.featured ? "1" : "0",
          "datetime('now')",
        ].join(",") +
        ") ON CONFLICT(`project_id`,`id`) DO UPDATE SET " +
        "`sqft`=excluded.`sqft`,`sqm`=excluded.`sqm`,`sqyd`=excluded.`sqyd`," +
        "`dimensions`=excluded.`dimensions`,`road`=excluded.`road`," +
        "`polygon`=excluded.`polygon`,`updated_at`=excluded.`updated_at`;",
    );
  }

  lines.push("");
  if (hasDimensions) {
    lines.push(
      "INSERT INTO `settings` (`project_id`,`key`,`value`,`updated_at`) VALUES (" +
        `${sqlText(id)},'mapWidth',${sqlText(String(Math.round(width)))},datetime('now')) ` +
        "ON CONFLICT(`project_id`,`key`) DO NOTHING;",
      "INSERT INTO `settings` (`project_id`,`key`,`value`,`updated_at`) VALUES (" +
        `${sqlText(id)},'mapHeight',${sqlText(String(Math.round(height)))},datetime('now')) ` +
        "ON CONFLICT(`project_id`,`key`) DO NOTHING;",
    );
  }
  lines.push(
    "INSERT INTO `settings` (`project_id`,`key`,`value`,`updated_at`) VALUES (" +
      `${sqlText(id)},'geometryImportSource',${sqlText(trimmed(sourceLabel, 200))},datetime('now')) ` +
      "ON CONFLICT(`project_id`,`key`) DO UPDATE SET `value`=excluded.`value`,`updated_at`=excluded.`updated_at`;",
    "INSERT INTO `settings` (`project_id`,`key`,`value`,`updated_at`) VALUES (" +
      `${sqlText(id)},'geometryImportCount',${sqlText(String(rows.length))},datetime('now')) ` +
      "ON CONFLICT(`project_id`,`key`) DO UPDATE SET `value`=excluded.`value`,`updated_at`=excluded.`updated_at`;",
    "",
  );

  return lines.join("\n");
}

function parseArgs(argv) {
  const out = { stdout: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--stdout") {
      out.stdout = true;
      continue;
    }
    if (!arg.startsWith("--")) throw new Error(`Unknown argument: ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} value missing hai`);
    out[key] = value;
    i += 1;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.projectId) throw new Error("--project-id required hai");
  if (!args.input) throw new Error("--input required hai");
  if (!args.output && !args.stdout) throw new Error("--output ya --stdout required hai");

  const inputText = await readFile(args.input, "utf8");
  const input = JSON.parse(inputText);
  const meta = sourceMeta(input);
  const coordinateSpace = String(args.coordinateSpace || meta.coordinateSpace || "pixels").toLowerCase();
  const width = Number(args.width ?? meta.sourceWidth ?? meta.mapWidth);
  const height = Number(args.height ?? meta.sourceHeight ?? meta.mapHeight);
  const rows = normalizeLegacyPlotRows({
    input,
    sourceWidth: width,
    sourceHeight: height,
    coordinateSpace,
    initialStatus: args.initialStatus || "available",
  });
  const sql = buildLegacyPlotMigrationSql({
    projectId: args.projectId,
    rows,
    sourceWidth: width,
    sourceHeight: height,
    coordinateSpace,
    sourceLabel: args.sourceLabel || "legacy-pixel-map-v1",
    inputName: args.input,
  });

  if (args.stdout) process.stdout.write(sql);
  if (args.output) await writeFile(args.output, sql, "utf8");
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
