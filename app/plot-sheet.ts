import { cleanPlotId } from "./mapper-geometry";

export type PlotSheetRow = {
  id: string;
  sqft: number;
  sqm: number;
  sqyd: number;
  dimensions: string;
  road: string;
  notes: string;
};

function parseCsvLine(line: string) {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      fields.push(current.trim());
      current = "";
    } else current += char;
  }
  fields.push(current.trim());
  return fields;
}

function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

const aliases: Record<string, string[]> = {
  id: ["id", "plot", "plotno", "plotnumber", "lot", "lotno", "lotnumber"],
  sqft: ["sqft", "squarefeet", "squarefoot", "areaft", "areasqft"],
  sqm: ["sqm", "squaremetre", "squaremeter", "m2", "areasqm"],
  sqyd: ["sqyd", "squareyard", "squareyards", "yd2", "areasqyd"],
  dimensions: ["dimensions", "dimension", "size", "plotsize", "measurement"],
  road: ["road", "roadaccess", "facing", "face", "roadfacing"],
  notes: ["notes", "note", "remarks", "remark"],
};

function columnFor(headers: string[], name: keyof typeof aliases) {
  const options = aliases[name];
  return headers.findIndex((header) => options.includes(header));
}

function normalizedObject(input: Record<string, unknown>) {
  const byHeader = new Map(
    Object.entries(input).map(([key, value]) => [normalizeHeader(key), value]),
  );
  const output: Record<string, unknown> = {};
  (Object.keys(aliases) as Array<keyof typeof aliases>).forEach((name) => {
    const alias = aliases[name].find((option) => byHeader.has(option));
    if (alias) output[name] = byHeader.get(alias);
  });
  return output;
}

function assertUniqueRows(rows: PlotSheetRow[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  rows.forEach((row) => {
    if (seen.has(row.id)) duplicates.add(row.id);
    seen.add(row.id);
  });
  if (duplicates.size) {
    throw new Error(
      `Plot sheet me duplicate Plot ID mile: ${[...duplicates].slice(0, 8).join(", ")}`,
    );
  }
  return rows;
}

function finite(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeRow(input: Record<string, unknown>): PlotSheetRow | null {
  const id = cleanPlotId(String(input.id || ""));
  if (!id) return null;
  let sqft = finite(input.sqft);
  let sqm = finite(input.sqm);
  let sqyd = finite(input.sqyd);
  if (!sqft && sqm) sqft = sqm * 10.7639;
  if (!sqft && sqyd) sqft = sqyd * 9;
  if (!sqm && sqft) sqm = sqft / 10.7639;
  if (!sqyd && sqft) sqyd = sqft / 9;
  if (!sqft) return null;
  return {
    id,
    sqft,
    sqm,
    sqyd,
    dimensions: String(input.dimensions || "").trim().slice(0, 120),
    road: String(input.road || "").trim().slice(0, 160),
    notes: String(input.notes || "").trim().slice(0, 2000),
  };
}

export function parsePlotSheetText(text: string, filename: string) {
  if (filename.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(text) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { plots?: unknown[] })?.plots)
        ? (parsed as { plots: unknown[] }).plots
        : [];
    return assertUniqueRows(
      list
        .map((item) => normalizedObject((item || {}) as Record<string, unknown>))
        .map((item) => normalizeRow(item))
        .filter((row): row is PlotSheetRow => Boolean(row)),
    );
  }

  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const indexes = {
    id: columnFor(headers, "id"),
    sqft: columnFor(headers, "sqft"),
    sqm: columnFor(headers, "sqm"),
    sqyd: columnFor(headers, "sqyd"),
    dimensions: columnFor(headers, "dimensions"),
    road: columnFor(headers, "road"),
    notes: columnFor(headers, "notes"),
  };
  if (indexes.id < 0 || (indexes.sqft < 0 && indexes.sqm < 0 && indexes.sqyd < 0)) {
    throw new Error("CSV me Plot No/ID aur area column (sqft/sqm/sqyd) chahiye");
  }
  const value = (row: string[], index: number) => (index >= 0 ? row[index] || "" : "");
  return assertUniqueRows(
    lines
      .slice(1)
      .map(parseCsvLine)
      .map((row) =>
        normalizeRow({
          id: value(row, indexes.id),
          sqft: value(row, indexes.sqft),
          sqm: value(row, indexes.sqm),
          sqyd: value(row, indexes.sqyd),
          dimensions: value(row, indexes.dimensions),
          road: value(row, indexes.road),
          notes: value(row, indexes.notes),
        }),
      )
      .filter((row): row is PlotSheetRow => Boolean(row)),
  );
}
