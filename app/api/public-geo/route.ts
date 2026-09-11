import { env } from "cloudflare:workers";
import { projectBySlug } from "../../project-context";
import {
  mapNormalizedPointToGeo,
  solveGeoCalibration,
  type GeoControlPoint,
} from "../../geo-calibration";
import {
  applyGeoFineAlignment,
  geoAlignmentAnchor,
  normalizeGeoFineAlignment,
} from "../../geo-fine-alignment";

type SnapshotFeature = {
  id?: string;
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
};

type GeoSnapshot = {
  schemaVersion?: number;
  revision?: number;
  featureCollection?: { features?: SnapshotFeature[] };
  controlPoints?: GeoControlPoint[];
  fineAlignment?: unknown;
};

function runtime() {
  return env as unknown as Record<string, unknown>;
}

async function sourceLiveSettings(projectId: string) {
  const keys = [
    "geoPublicEnabled",
    "geoPublicLabProjectId",
    "geoPublicRevision",
    "geoPublicOverlayKey",
    "geoPublicToken",
  ];
  const rows = await env.DB.prepare(
    `SELECT key,value FROM settings WHERE project_id=? AND key IN (${keys.map(() => "?").join(",")})`,
  )
    .bind(projectId, ...keys)
    .all<{ key: string; value: string }>();
  return new Map(rows.results.map((row) => [row.key, row.value]));
}

async function validLabLink(sourceProjectId: string, labProjectId: string) {
  const rows = await env.DB.prepare(
    "SELECT key,value FROM settings WHERE project_id=? AND key IN ('geoLabMode','geoLabSourceProjectId')",
  )
    .bind(labProjectId)
    .all<{ key: string; value: string }>();
  const values = new Map(rows.results.map((row) => [row.key, row.value]));
  return (
    values.get("geoLabMode") === "1" &&
    values.get("geoLabSourceProjectId") === sourceProjectId
  );
}

async function browserMapsKey() {
  const row = await env.DB.prepare(
    "SELECT value FROM platform_settings WHERE key='google_maps_browser_key' LIMIT 1",
  ).first<{ value: string }>();
  return (
    String(row?.value || "").trim() ||
    String(runtime().GOOGLE_MAPS_BROWSER_KEY || "").trim()
  );
}

function polygonRing(raw: unknown) {
  if (!Array.isArray(raw) || !Array.isArray(raw[0])) return [] as [number, number][];
  const result: [number, number][] = [];
  for (const point of raw[0] as unknown[]) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    result.push([lng, lat]);
  }
  return result;
}

function statusValue(value: string) {
  const normalized = String(value || "available").toLowerCase();
  if (normalized === "sold") return "sold";
  if (normalized === "booked" || normalized === "hold") return "booked";
  return "available";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get("projectSlug")?.trim() || "";
    if (!slug)
      return Response.json({ error: "Project slug required" }, { status: 400 });

    const source = await projectBySlug(slug);
    if (!source)
      return Response.json({ error: "Published project nahi mila" }, { status: 404 });

    const live = await sourceLiveSettings(source.id);
    if (live.get("geoPublicEnabled") !== "1")
      return Response.json({ error: "Satellite Geo map live nahi hai" }, { status: 404 });

    const labProjectId = String(live.get("geoPublicLabProjectId") || "");
    const revision = Number(live.get("geoPublicRevision") || 0);
    const overlayKey = String(live.get("geoPublicOverlayKey") || "");
    const token = String(live.get("geoPublicToken") || "");
    if (!labProjectId || revision < 1 || !overlayKey || !token)
      return Response.json({ error: "Geo live pointer incomplete hai" }, { status: 404 });

    if (!(await validLabLink(source.id, labProjectId)))
      return Response.json({ error: "Geo live ownership mismatch" }, { status: 404 });

    const [version, plotRows, mapsKey] = await Promise.all([
      env.DB.prepare(
        "SELECT snapshot FROM geo_versions WHERE project_id=? AND version=? LIMIT 1",
      )
        .bind(labProjectId, revision)
        .first<{ snapshot: string }>(),
      env.DB.prepare(
        "SELECT id,status,sqft,sqm,sqyd,dimensions,road FROM plots WHERE project_id=? ORDER BY id",
      )
        .bind(source.id)
        .all<{
          id: string;
          status: string;
          sqft: number;
          sqm: number;
          sqyd: number;
          dimensions: string;
          road: string;
        }>(),
      browserMapsKey(),
    ]);

    if (!version?.snapshot)
      return Response.json({ error: "Published Geo snapshot unavailable" }, { status: 404 });

    const snapshot = JSON.parse(version.snapshot) as GeoSnapshot;
    const controlPoints = Array.isArray(snapshot.controlPoints)
      ? snapshot.controlPoints
      : [];
    if (controlPoints.length < 4)
      return Response.json({ error: "Published calibration incomplete hai" }, { status: 409 });

    const calibration = solveGeoCalibration(controlPoints);
    const fineAlignment = normalizeGeoFineAlignment(snapshot.fineAlignment);
    const anchor = geoAlignmentAnchor(calibration);
    const transform = (point: [number, number]) =>
      applyGeoFineAlignment(point, anchor, fineAlignment);

    const cornerSources: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const masterplanCorners = cornerSources.map((point) =>
      transform(mapNormalizedPointToGeo(calibration, point)),
    );

    const plotsById = new Map(plotRows.results.map((plot) => [plot.id, plot]));
    const features = (snapshot.featureCollection?.features || [])
      .filter((feature) => feature.geometry?.type === "Polygon")
      .map((feature) => {
        const properties = feature.properties || {};
        const linkedPlotId = String(properties.linkedPlotId || "").trim() || null;
        const plot = linkedPlotId ? plotsById.get(linkedPlotId) : undefined;
        const rawPath = polygonRing(feature.geometry?.coordinates);
        return {
          id: String(feature.id || linkedPlotId || crypto.randomUUID()),
          name: String(properties.name || (linkedPlotId ? `Plot ${linkedPlotId}` : "Site feature")),
          linkedPlotId,
          source: String(properties.source || ""),
          layer: String(properties.layer || ""),
          status: statusValue(plot?.status || "available"),
          sqft: Number(plot?.sqft || 0),
          sqm: Number(plot?.sqm || 0),
          sqyd: Number(plot?.sqyd || 0),
          dimensions: String(plot?.dimensions || ""),
          road: String(plot?.road || ""),
          path: rawPath.map(transform),
        };
      })
      .filter((feature) => feature.path.length >= 3);

    const allPoints = [
      ...masterplanCorners,
      ...features.flatMap((feature) => feature.path),
    ];
    const bounds = {
      minLng: Math.min(...allPoints.map((point) => point[0])),
      minLat: Math.min(...allPoints.map((point) => point[1])),
      maxLng: Math.max(...allPoints.map((point) => point[0])),
      maxLat: Math.max(...allPoints.map((point) => point[1])),
    };

    return Response.json(
      {
        schemaVersion: 1,
        project: {
          id: source.id,
          name: source.name,
          slug: source.slug,
        },
        revision,
        maps: {
          enabled: Boolean(mapsKey),
          apiKey: mapsKey || null,
        },
        masterplanUrl:
          `/api/public-geo-masterplan?projectSlug=${encodeURIComponent(source.slug)}` +
          `&v=${encodeURIComponent(token)}`,
        masterplanCorners,
        bounds,
        features,
        counts: {
          total: features.filter((feature) => feature.linkedPlotId).length,
          available: features.filter(
            (feature) => feature.linkedPlotId && feature.status === "available",
          ).length,
          booked: features.filter(
            (feature) => feature.linkedPlotId && feature.status === "booked",
          ).length,
          sold: features.filter(
            (feature) => feature.linkedPlotId && feature.status === "sold",
          ).length,
        },
      },
      {
        headers: {
          "cache-control": "no-store",
          "x-rekixo-project": source.id,
          "x-rekixo-geo-revision": String(revision),
          "x-content-type-options": "nosniff",
        },
      },
    );
  } catch (error) {
    console.error("Public Geo map load failed", error);
    return Response.json(
      { error: "Satellite Geo map unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
