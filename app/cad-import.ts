import { DwgReader, DxfReader } from "@node-projects/acad-ts";
import type { CadCandidate, CadGeometry, CadLabel, MapperPoint } from "./mapper-geometry";
import { polygonArea, polygonCenter } from "./mapper-geometry";

type LooseEntity = Record<string, unknown> & {
  constructor?: { name?: string };
  isClosed?: boolean;
  vertices?: Iterable<unknown>;
  getPoints?: (precision?: number) => Iterable<unknown>;
  layer?: { name?: string };
  value?: string;
  plainText?: string;
  insertPoint?: { x?: number; y?: number };
  alignmentPoint?: { x?: number; y?: number };
  startPoint?: { x?: number; y?: number };
  endPoint?: { x?: number; y?: number };
};

type XYLike = { x?: number; y?: number; location?: { x?: number; y?: number } };

const MAX_CANDIDATES = 3000;
const MAX_POINTS = 80;
const MAX_LINE_EDGES_FOR_FACE_DETECTION = 20_000;

function finitePoint(value: unknown): [number, number] | null {
  const item = value as XYLike | null;
  const source = item?.location || item;
  const x = Number(source?.x);
  const y = Number(source?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

function cleanPolyline(points: [number, number][]) {
  const cleaned: [number, number][] = [];
  for (const point of points) {
    const previous = cleaned[cleaned.length - 1];
    if (!previous || Math.hypot(point[0] - previous[0], point[1] - previous[1]) > 1e-9) {
      cleaned.push(point);
    }
  }
  if (
    cleaned.length > 3 &&
    Math.hypot(
      cleaned[0][0] - cleaned[cleaned.length - 1][0],
      cleaned[0][1] - cleaned[cleaned.length - 1][1],
    ) < 1e-9
  ) {
    cleaned.pop();
  }
  if (cleaned.length <= MAX_POINTS) return cleaned;
  const step = Math.ceil(cleaned.length / MAX_POINTS);
  return cleaned.filter((_, index) => index % step === 0).slice(0, MAX_POINTS);
}

function entityPolyline(entity: LooseEntity) {
  if (!entity.isClosed) return null;
  const direct: [number, number][] = [];
  try {
    if (entity.vertices && Symbol.iterator in Object(entity.vertices)) {
      for (const vertex of entity.vertices) {
        const point = finitePoint(vertex);
        if (point) direct.push(point);
      }
    }
  } catch {
    // Some CAD entities expose non-standard vertex collections; getPoints is fallback.
  }
  if (direct.length >= 3) return cleanPolyline(direct);
  if (typeof entity.getPoints === "function") {
    try {
      const sampled = Array.from(entity.getPoints(32), finitePoint).filter(
        (point): point is [number, number] => Boolean(point),
      );
      if (sampled.length >= 3) return cleanPolyline(sampled);
    } catch {
      return null;
    }
  }
  return null;
}

function entityText(entity: LooseEntity) {
  const name = entity.constructor?.name || "";
  if (!/Text/i.test(name) && typeof entity.value !== "string" && typeof entity.plainText !== "string") {
    return null;
  }
  const text = String(entity.plainText || entity.value || "")
    .replace(/\\P/gi, " ")
    .replace(/[{}]/g, "")
    .trim();
  if (!text || text.length > 80) return null;
  const point = finitePoint(entity.insertPoint || entity.alignmentPoint);
  return point ? { text, point } : null;
}

function boundsFor(points: [number, number][]) {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

type RawLine = { start: [number, number]; end: [number, number] };

/**
 * Some civil drawings use individual LINE entities instead of closed plot
 * polylines. Build the bounded planar faces from a reasonably sized line
 * network so those projects still get automatic candidates. Crossings that do
 * not share endpoints intentionally remain unresolved and fall back to review.
 */
function lineNetworkFaces(lines: RawLine[]) {
  if (lines.length < 3 || lines.length > MAX_LINE_EDGES_FOR_FACE_DETECTION) return [];
  const endpoints = lines.flatMap((line) => [line.start, line.end]);
  const bounds = boundsFor(endpoints);
  const diagonal = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) || 1;
  const tolerance = Math.max(diagonal * 1e-7, 1e-8);
  const nodes = new Map<string, [number, number]>();
  const adjacency = new Map<string, Set<string>>();
  const keyFor = ([x, y]: [number, number]) =>
    `${Math.round(x / tolerance)},${Math.round(y / tolerance)}`;
  const addNeighbor = (from: string, to: string) => {
    const set = adjacency.get(from) || new Set<string>();
    set.add(to);
    adjacency.set(from, set);
  };
  for (const line of lines) {
    const a = keyFor(line.start);
    const b = keyFor(line.end);
    if (a === b) continue;
    if (!nodes.has(a)) nodes.set(a, line.start);
    if (!nodes.has(b)) nodes.set(b, line.end);
    addNeighbor(a, b);
    addNeighbor(b, a);
  }

  const sortedNeighbors = new Map<string, string[]>();
  for (const [key, neighbors] of adjacency) {
    const origin = nodes.get(key)!;
    sortedNeighbors.set(
      key,
      [...neighbors].sort((left, right) => {
        const a = nodes.get(left)!;
        const b = nodes.get(right)!;
        return (
          Math.atan2(a[1] - origin[1], a[0] - origin[0]) -
          Math.atan2(b[1] - origin[1], b[0] - origin[0])
        );
      }),
    );
  }

  const visited = new Set<string>();
  const faces: [number, number][][] = [];
  const directedKey = (a: string, b: string) => `${a}>${b}`;
  for (const [start, neighbors] of adjacency) {
    for (const first of neighbors) {
      if (visited.has(directedKey(start, first))) continue;
      const cycleKeys: string[] = [];
      let from = start;
      let to = first;
      let closed = false;
      for (let guard = 0; guard < 240; guard += 1) {
        const edgeKey = directedKey(from, to);
        if (visited.has(edgeKey) && !(from === start && to === first)) break;
        visited.add(edgeKey);
        cycleKeys.push(from);
        const around = sortedNeighbors.get(to) || [];
        const incomingIndex = around.indexOf(from);
        if (incomingIndex < 0 || around.length < 2) break;
        const next = around[(incomingIndex - 1 + around.length) % around.length];
        from = to;
        to = next;
        if (from === start && to === first) {
          closed = true;
          break;
        }
      }
      if (!closed || cycleKeys.length < 3 || cycleKeys.length > MAX_POINTS) continue;
      const points = cleanPolyline(
        cycleKeys.map((key) => nodes.get(key)!).filter(Boolean),
      );
      if (points.length < 3) continue;
      const signedArea = polygonArea(points);
      // The traversal also visits the unbounded exterior face in the reverse
      // direction. Keep only counter-clockwise bounded faces.
      if (!(signedArea > tolerance * tolerance)) continue;
      faces.push(points);
      if (faces.length >= MAX_CANDIDATES * 2) return faces;
    }
  }
  return faces;
}

function normalizePoint(
  point: [number, number],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): MapperPoint {
  const width = bounds.maxX - bounds.minX || 1;
  const height = bounds.maxY - bounds.minY || 1;
  // CAD Y grows upward while image Y grows downward. Flip once here so calibration preview behaves naturally.
  return [
    (point[0] - bounds.minX) / width,
    1 - (point[1] - bounds.minY) / height,
  ];
}

function candidateKey(layer: string, points: MapperPoint[], index: number) {
  const signature = points
    .map(([x, y]) => `${x.toFixed(5)},${y.toFixed(5)}`)
    .join(";");
  let hash = 2166136261;
  for (let cursor = 0; cursor < signature.length; cursor += 1) {
    hash ^= signature.charCodeAt(cursor);
    hash = Math.imul(hash, 16777619);
  }
  return `${layer || "0"}:${(hash >>> 0).toString(36)}:${index}`;
}

export async function parseCadGeometry(file: File): Promise<CadGeometry> {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension !== "dwg" && extension !== "dxf") {
    throw new Error("CAD file .dwg ya .dxf honi chahiye");
  }
  const buffer = await file.arrayBuffer();
  const document =
    extension === "dwg"
      ? DwgReader.readFromStream(buffer)
      : DxfReader.readFromStream(new Uint8Array(buffer));

  const rawPolygons: { points: [number, number][]; layer: string; rawArea: number }[] = [];
  const rawLabels: { text: string; point: [number, number] }[] = [];
  const rawLines: RawLine[] = [];
  const allPoints: [number, number][] = [];
  let entityCount = 0;
  let closedPolylineCount = 0;
  let lineCount = 0;

  for (const item of document.entities as Iterable<unknown>) {
    entityCount += 1;
    const entity = item as LooseEntity;
    const constructorName = entity.constructor?.name || "";
    if (constructorName === "Line" || (entity.startPoint && entity.endPoint)) {
      lineCount += 1;
      const start = finitePoint(entity.startPoint);
      const end = finitePoint(entity.endPoint);
      if (start) allPoints.push(start);
      if (end) allPoints.push(end);
      if (start && end) rawLines.push({ start, end });
    }

    const text = entityText(entity);
    if (text) {
      rawLabels.push(text);
      allPoints.push(text.point);
    }

    const polygon = entityPolyline(entity);
    if (!polygon || polygon.length < 3) continue;
    const rawArea = Math.abs(polygonArea(polygon));
    if (!Number.isFinite(rawArea) || rawArea <= 1e-8) continue;
    closedPolylineCount += 1;
    allPoints.push(...polygon);
    rawPolygons.push({
      points: polygon,
      layer: String(entity.layer?.name || "0").slice(0, 120),
      rawArea,
    });
  }

  const lineFaces = lineNetworkFaces(rawLines);
  for (const points of lineFaces) {
    const rawArea = Math.abs(polygonArea(points));
    if (rawArea > 1e-8) rawPolygons.push({ points, layer: "LINE-FACE", rawArea });
  }

  if (!allPoints.length || !rawPolygons.length) {
    throw new Error(
      "CAD read hua, lekin closed plot faces nahi mili. DXF export ya precise manual mapper use karein.",
    );
  }

  // Use polygon extents instead of text extents; notes far outside the site should not shrink the preview.
  const polygonBounds = boundsFor(rawPolygons.flatMap((polygon) => polygon.points));
  const normalized = rawPolygons
    .map((polygon, index) => {
      const points = polygon.points.map((point) => normalizePoint(point, polygonBounds));
      return {
        key: candidateKey(polygon.layer, points, index),
        layer: polygon.layer,
        points,
        center: polygonCenter(points),
        area: Math.abs(polygonArea(points)),
        rawArea: polygon.rawArea,
      };
    })
    .filter((candidate) => candidate.area > 1e-8)
    .sort((a, b) => a.area - b.area);

  // Remove exact/near duplicate closed polylines that often exist on multiple CAD layers.
  const seen = new Set<string>();
  const candidates: CadCandidate[] = [];
  for (const candidate of normalized) {
    const signature = candidate.points
      .map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`)
      .sort()
      .join("|");
    if (seen.has(signature)) continue;
    seen.add(signature);
    candidates.push({
      key: candidate.key,
      layer: candidate.layer,
      points: candidate.points,
      center: candidate.center,
      area: candidate.area,
      rawArea: candidate.rawArea,
    });
    if (candidates.length >= MAX_CANDIDATES) break;
  }

  const labels: CadLabel[] = rawLabels
    .filter((label) =>
      label.point[0] >= polygonBounds.minX &&
      label.point[0] <= polygonBounds.maxX &&
      label.point[1] >= polygonBounds.minY &&
      label.point[1] <= polygonBounds.maxY,
    )
    .map((label) => ({
      text: label.text,
      point: normalizePoint(label.point, polygonBounds),
    }))
    .slice(0, 10000);

  return {
    version: 1,
    sourceName: file.name,
    sourceFormat: extension,
    bounds: polygonBounds,
    candidates,
    labels,
    diagnostics: {
      entityCount,
      closedPolylineCount,
      textCount: labels.length,
      lineCount,
      lineFaceCount: lineFaces.length,
    },
  };
}
