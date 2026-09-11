import { env } from "cloudflare:workers";
import { requireSuperAdmin, sameOrigin } from "../../admin-auth";
import { writeAudit } from "../../audit";
import {
  featureRowToRecord,
  featuresToFeatureCollection,
  normalizeGeoFeature,
} from "../../geo-model";
import {
  geoCalibrationDiagnostics,
  mapNormalizedPolygonToGeo,
  solveGeoCalibration,
  type GeoControlPoint,
} from "../../geo-calibration";
import type { MapperPoint } from "../../mapper-geometry";

const denied = () =>
  Response.json({ error: "Super Admin access required" }, { status: 403 });

const migrationPending = (error: unknown) =>
  error instanceof Error && /no such table:\s*geo_/i.test(error.message);

async function projectExists(projectId: string) {
  return Boolean(
    await env.DB.prepare("SELECT id FROM projects WHERE id=? AND status!='deleted' LIMIT 1")
      .bind(projectId)
      .first(),
  );
}

async function ensureProjectState(projectId: string, now = new Date().toISOString()) {
  await env.DB.prepare(
    "INSERT INTO geo_project_settings (project_id,draft_revision,published_revision,public_enabled,published_at,updated_at) VALUES (?,0,0,0,NULL,?) ON CONFLICT(project_id) DO NOTHING",
  )
    .bind(projectId, now)
    .run();
}

function revisionStatement(projectId: string, now: string) {
  return env.DB.prepare(
    "UPDATE geo_project_settings SET draft_revision=draft_revision+1,updated_at=? WHERE project_id=?",
  ).bind(now, projectId);
}

function cleanControlPoint(raw: unknown, index: number): GeoControlPoint & { order: number } {
  if (!raw || typeof raw !== "object") throw new Error("Control point invalid hai");
  const item = raw as Record<string, unknown>;
  const x = Number(item.x ?? (Array.isArray(item.source) ? item.source[0] : NaN));
  const y = Number(item.y ?? (Array.isArray(item.source) ? item.source[1] : NaN));
  const longitude = Number(
    item.longitude ?? item.lng ?? (Array.isArray(item.target) ? item.target[0] : NaN),
  );
  const latitude = Number(
    item.latitude ?? item.lat ?? (Array.isArray(item.target) ? item.target[1] : NaN),
  );
  if (![x, y, longitude, latitude].every(Number.isFinite))
    throw new Error(`Control point ${index + 1} incomplete hai`);
  if (x < 0 || x > 1 || y < 0 || y > 1)
    throw new Error(`Control point ${index + 1} ka source 0..1 me hona chahiye`);
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90)
    throw new Error(`Control point ${index + 1} ka longitude/latitude invalid hai`);
  const id = String(item.id || crypto.randomUUID()).trim().slice(0, 120);
  if (!id) throw new Error("Control point id invalid hai");
  return {
    id,
    source: [x, y],
    target: [longitude, latitude],
    label: String(item.label || "").trim().slice(0, 120),
    order: index,
  };
}

async function loadControlPoints(projectId: string) {
  const rows = await env.DB.prepare(
    "SELECT id,source_x AS sourceX,source_y AS sourceY,longitude,latitude,label,sort_order AS sortOrder FROM geo_control_points WHERE project_id=? ORDER BY sort_order,id",
  )
    .bind(projectId)
    .all<{
      id: string;
      sourceX: number;
      sourceY: number;
      longitude: number;
      latitude: number;
      label: string;
      sortOrder: number;
    }>();
  return rows.results.map((row) => ({
    id: row.id,
    source: [Number(row.sourceX), Number(row.sourceY)] as MapperPoint,
    target: [Number(row.longitude), Number(row.latitude)] as [number, number],
    label: row.label,
  }));
}

function sameControlPoints(a: GeoControlPoint[], b: GeoControlPoint[]) {
  if (a.length !== b.length) return false;
  return a.every((point, index) => {
    const other = b[index];
    return Boolean(
      other &&
        point.id === other.id &&
        point.source[0] === other.source[0] &&
        point.source[1] === other.source[1] &&
        point.target[0] === other.target[0] &&
        point.target[1] === other.target[1] &&
        String(point.label || "") === String(other.label || ""),
    );
  });
}

function geoCalibrationFingerprint(points: GeoControlPoint[]) {
  const text = JSON.stringify(
    points.map((point) => [
      point.id,
      Number(point.source[0]),
      Number(point.source[1]),
      Number(point.target[0]),
      Number(point.target[1]),
    ]),
  );
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function loadFeatures(projectId: string) {
  const rows = await env.DB.prepare(
    "SELECT id,project_id AS projectId,name,layer,geometry_type AS geometryType,geometry,linked_plot_id AS linkedPlotId,source,properties,updated_at AS updatedAt FROM geo_features WHERE project_id=? ORDER BY layer,name,id",
  )
    .bind(projectId)
    .all<{
      id: string;
      projectId: string;
      name: string;
      layer: string;
      geometryType: string;
      geometry: string;
      linkedPlotId: string | null;
      source: string;
      properties: string;
      updatedAt: string;
    }>();
  return rows.results.map(featureRowToRecord);
}

async function loadState(projectId: string) {
  await ensureProjectState(projectId);
  const [state, features, controlPoints, plots, sources] = await Promise.all([
    env.DB.prepare(
      "SELECT draft_revision AS draftRevision,published_revision AS publishedRevision,public_enabled AS publicEnabled,published_at AS publishedAt,updated_at AS updatedAt FROM geo_project_settings WHERE project_id=?",
    )
      .bind(projectId)
      .first<{
        draftRevision: number;
        publishedRevision: number;
        publicEnabled: number;
        publishedAt: string | null;
        updatedAt: string;
      }>(),
    loadFeatures(projectId),
    loadControlPoints(projectId),
    env.DB.prepare(
      "SELECT id,status,sqft,sqm,sqyd,dimensions,road,polygon FROM plots WHERE project_id=? AND TRIM(COALESCE(polygon,''))<>'' ORDER BY id",
    )
      .bind(projectId)
      .all<{
        id: string;
        status: string;
        sqft: number;
        sqm: number;
        sqyd: number;
        dimensions: string;
        road: string;
        polygon: string;
      }>(),
    env.DB.prepare(
      "SELECT id,filename,content_type AS contentType,size_bytes AS sizeBytes,sha256,created_at AS createdAt FROM geo_sources WHERE project_id=? ORDER BY created_at DESC LIMIT 20",
    )
      .bind(projectId)
      .all<{
        id: string;
        filename: string;
        contentType: string;
        sizeBytes: number;
        sha256: string;
        createdAt: string;
      }>(),
  ]);

  let calibrationErrorMeters: number | null = null;
  let calibrationDiagnostics: ReturnType<typeof geoCalibrationDiagnostics> | null = null;
  if (controlPoints.length >= 4) {
    try {
      const calibration = solveGeoCalibration(controlPoints);
      calibrationDiagnostics = geoCalibrationDiagnostics(controlPoints, calibration);
      calibrationErrorMeters = calibrationDiagnostics.fitMeanErrorMeters;
    } catch {
      calibrationErrorMeters = null;
      calibrationDiagnostics = null;
    }
  }

  return {
    schemaVersion: 1,
    projectId,
    features,
    controlPoints,
    plots: plots.results.map((plot) => ({
      id: plot.id,
      status: plot.status,
      sqft: Number(plot.sqft || 0),
      sqm: Number(plot.sqm || 0),
      sqyd: Number(plot.sqyd || 0),
      dimensions: plot.dimensions || "",
      road: plot.road || "",
    })),
    sources: sources.results,
    calibrationErrorMeters,
    calibrationDiagnostics,
    publish: {
      draftRevision: Number(state?.draftRevision || 0),
      publishedRevision: Number(state?.publishedRevision || 0),
      publicEnabled: Boolean(state?.publicEnabled),
      publishedAt: state?.publishedAt || null,
      dirty: Number(state?.draftRevision || 0) !== Number(state?.publishedRevision || 0),
    },
  };
}

function parsePlotPolygon(value: string): MapperPoint[] {
  const points = JSON.parse(value) as unknown;
  if (
    !Array.isArray(points) ||
    points.length < 3 ||
    points.length > 80 ||
    !points.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        point.every((value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1),
    )
  )
    throw new Error("Plot Mapper polygon invalid hai");
  return points.map((point) => [Number(point[0]), Number(point[1])] as MapperPoint);
}

async function assertLinkedPlotsExist(
  projectId: string,
  features: Array<ReturnType<typeof normalizeGeoFeature>>,
) {
  const linkedPlotIds = [...new Set(
    features.map((feature) => feature.linkedPlotId).filter((value): value is string => Boolean(value)),
  )];
  if (!linkedPlotIds.length) return;
  const placeholders = linkedPlotIds.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT id FROM plots WHERE project_id=? AND id IN (${placeholders})`,
  )
    .bind(projectId, ...linkedPlotIds)
    .all<{ id: string }>();
  const found = new Set(rows.results.map((row) => row.id));
  const missing = linkedPlotIds.filter((id) => !found.has(id));
  if (missing.length)
    throw new Error(`Linked plot project me nahi mila: ${missing.slice(0, 5).join(", ")}`);
}

async function saveFeatureBatch(projectId: string, rawFeatures: unknown[], actor: Awaited<ReturnType<typeof requireSuperAdmin>>) {
  if (!rawFeatures.length || rawFeatures.length > 80)
    throw new Error("Ek request me 1 se 80 Geo features bhejein");
  const features = rawFeatures.map(normalizeGeoFeature);
  await assertLinkedPlotsExist(projectId, features);
  const now = new Date().toISOString();
  await ensureProjectState(projectId, now);
  const statements = features.map((feature) => {
    const id = feature.id || crypto.randomUUID();
    return env.DB.prepare(
      "INSERT INTO geo_features (project_id,id,name,layer,geometry_type,geometry,linked_plot_id,source,properties,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,id) DO UPDATE SET name=excluded.name,layer=excluded.layer,geometry_type=excluded.geometry_type,geometry=excluded.geometry,linked_plot_id=excluded.linked_plot_id,source=excluded.source,properties=excluded.properties,updated_at=excluded.updated_at",
    ).bind(
      projectId,
      id,
      feature.name || "",
      feature.layer || "default",
      feature.geometry.type,
      JSON.stringify(feature.geometry),
      feature.linkedPlotId || null,
      feature.source || "manual",
      JSON.stringify(feature.properties || {}),
      now,
    );
  });
  await env.DB.batch([...statements, revisionStatement(projectId, now)]);
  if (actor) {
    await writeAudit(actor, "geo.features_saved", projectId, null, { count: features.length });
  }
  return features.length;
}

async function archiveSource(projectId: string, file: File, actor: NonNullable<Awaited<ReturnType<typeof requireSuperAdmin>>>) {
  const extension = file.name.toLowerCase().split(".").pop() || "";
  if (!["kml", "geojson", "json"].includes(extension))
    return Response.json({ error: "Sirf KML/GeoJSON/JSON source file supported hai" }, { status: 400 });
  if (file.size < 1 || file.size > 5 * 1024 * 1024)
    return Response.json({ error: "Geo source file 5 MB se chhoti honi chahiye" }, { status: 400 });

  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  const sha256 = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const existing = await env.DB.prepare(
    "SELECT id,filename,size_bytes AS sizeBytes,sha256,created_at AS createdAt FROM geo_sources WHERE project_id=? AND sha256=? ORDER BY created_at LIMIT 1",
  )
    .bind(projectId, sha256)
    .first<{ id: string; filename: string; sizeBytes: number; sha256: string; createdAt: string }>();
  if (existing) return Response.json({ ok: true, source: existing, reused: true });
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 180) || `source.${extension}`;
  const objectKey = `projects/${projectId}/geo/sources/${id}/${safeName}`;
  const now = new Date().toISOString();
  await env.BUCKET.put(objectKey, buffer, {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  try {
    await env.DB.prepare(
      "INSERT INTO geo_sources (project_id,id,filename,content_type,size_bytes,sha256,object_key,created_at) VALUES (?,?,?,?,?,?,?,?)",
    )
      .bind(projectId, id, file.name.slice(0, 240), file.type || "application/octet-stream", file.size, sha256, objectKey, now)
      .run();
  } catch (error) {
    await env.BUCKET.delete(objectKey);
    throw error;
  }
  await writeAudit(actor, "geo.source_archived", projectId, id, {
    filename: file.name,
    size: file.size,
    sha256,
  });
  return Response.json({ ok: true, source: { id, filename: file.name, sizeBytes: file.size, sha256, createdAt: now } });
}

export async function GET(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return denied();
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim() || "";
  if (!projectId) return Response.json({ error: "Project required" }, { status: 400 });
  if (!(await projectExists(projectId)))
    return Response.json({ error: "Project nahi mila" }, { status: 404 });
  try {
    return Response.json(await loadState(projectId), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (migrationPending(error))
      return Response.json(
        { error: "Geo Mapper migration pending hai. Pehle D1 migration 0009 apply karein." },
        { status: 503 },
      );
    console.error("Geo Mapper load failed", error);
    return Response.json({ error: "Geo Mapper data load nahi hua" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return denied();
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid request origin" }, { status: 403 });

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await request.formData();
      const projectId = String(form.get("projectId") || "").trim();
      const file = form.get("file");
      if (!projectId || !(await projectExists(projectId)))
        return Response.json({ error: "Project nahi mila" }, { status: 404 });
      if (!(file instanceof File))
        return Response.json({ error: "Geo source file nahi mili" }, { status: 400 });
      return await archiveSource(projectId, file, actor);
    } catch (error) {
      if (migrationPending(error))
        return Response.json({ error: "Geo Mapper migration pending hai" }, { status: 503 });
      console.error("Geo source archive failed", error);
      return Response.json({ error: "Geo source archive nahi hui" }, { status: 500 });
    }
  }

  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    action?: string;
    feature?: unknown;
    features?: unknown[];
    controlPoints?: unknown[];
    expectedDraftRevision?: number;
    id?: string;
  };
  const projectId = String(body.projectId || "").trim();
  if (!projectId) return Response.json({ error: "Project required" }, { status: 400 });
  if (!(await projectExists(projectId)))
    return Response.json({ error: "Project nahi mila" }, { status: 404 });

  try {
    const now = new Date().toISOString();
    await ensureProjectState(projectId, now);

    if (body.action === "save_control_points") {
      const raw = Array.isArray(body.controlPoints) ? body.controlPoints : [];
      if (raw.length > 12) return Response.json({ error: "Adhiktam 12 control points rakhein" }, { status: 400 });
      const points = raw.map(cleanControlPoint);
      if (points.length >= 4) solveGeoCalibration(points);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM geo_control_points WHERE project_id=?").bind(projectId),
        ...points.map((point) =>
          env.DB.prepare(
            "INSERT INTO geo_control_points (project_id,id,source_x,source_y,longitude,latitude,label,sort_order,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
          ).bind(
            projectId,
            point.id,
            point.source[0],
            point.source[1],
            point.target[0],
            point.target[1],
            point.label || "",
            point.order,
            now,
          ),
        ),
        revisionStatement(projectId, now),
      ]);
      await writeAudit(actor, "geo.control_points_saved", projectId, null, { count: points.length });
      return Response.json(await loadState(projectId));
    }

    if (body.action === "upsert_feature") {
      await saveFeatureBatch(projectId, [body.feature], actor);
      return Response.json(await loadState(projectId));
    }

    if (body.action === "import_features") {
      const features = Array.isArray(body.features) ? body.features : [];
      const count = await saveFeatureBatch(projectId, features, actor);
      return Response.json({ ok: true, count });
    }

    if (body.action === "delete_feature") {
      const id = String(body.id || "").trim();
      if (!id) return Response.json({ error: "Feature id required" }, { status: 400 });
      const result = await env.DB.batch([
        env.DB.prepare("DELETE FROM geo_features WHERE project_id=? AND id=?").bind(projectId, id),
        revisionStatement(projectId, now),
      ]);
      await writeAudit(actor, "geo.feature_deleted", projectId, id, {});
      void result;
      return Response.json(await loadState(projectId));
    }

    if (body.action === "generate_plot_features") {
      const requestedControlPoints = Array.isArray(body.controlPoints)
        ? body.controlPoints.map(cleanControlPoint)
        : [];
      const controlPoints = await loadControlPoints(projectId);
      if (!sameControlPoints(requestedControlPoints, controlPoints))
        return Response.json(
          { error: "Calibration badli hai. Save Calibration/Refresh karke phir Generate karein." },
          { status: 409 },
        );
      const calibration = solveGeoCalibration(controlPoints);
      const calibrationFingerprint = geoCalibrationFingerprint(controlPoints);
      const existingGenerated = await env.DB.prepare(
        "SELECT id FROM geo_features WHERE project_id=? AND source='plot_mapper'",
      )
        .bind(projectId)
        .all<{ id: string }>();
      const plotRows = await env.DB.prepare(
        "SELECT id,status,polygon FROM plots WHERE project_id=? AND TRIM(COALESCE(polygon,''))<>'' ORDER BY id",
      )
        .bind(projectId)
        .all<{ id: string; status: string; polygon: string }>();
      if (!plotRows.results.length)
        return Response.json({ error: "Is project me mapped plot polygons nahi mile" }, { status: 400 });

      const generated = plotRows.results.map((plot) => ({
        id: `plot:${plot.id}`,
        name: `Plot ${plot.id}`,
        layer: "plots",
        linkedPlotId: plot.id,
        source: "plot_mapper",
        properties: { calibrationFingerprint },
        geometry: {
          type: "Polygon" as const,
          coordinates: [mapNormalizedPolygonToGeo(calibration, parsePlotPolygon(plot.polygon))],
        },
      }));
      for (let index = 0; index < generated.length; index += 80) {
        await saveFeatureBatch(projectId, generated.slice(index, index + 80), actor);
      }

      const generatedIds = new Set(generated.map((feature) => feature.id));
      const staleGeneratedIds = existingGenerated.results
        .map((row) => row.id)
        .filter((id) => !generatedIds.has(id));
      for (let index = 0; index < staleGeneratedIds.length; index += 80) {
        await env.DB.batch(
          staleGeneratedIds.slice(index, index + 80).map((id) =>
            env.DB.prepare(
              "DELETE FROM geo_features WHERE project_id=? AND id=? AND source='plot_mapper'",
            ).bind(projectId, id),
          ),
        );
      }

      return Response.json({
        ...(await loadState(projectId)),
        generated: generated.length,
        staleRemoved: staleGeneratedIds.length,
      });
    }

    if (body.action === "publish") {
      const state = await env.DB.prepare(
        "SELECT draft_revision AS draftRevision,published_revision AS publishedRevision,public_enabled AS publicEnabled FROM geo_project_settings WHERE project_id=?",
      )
        .bind(projectId)
        .first<{ draftRevision: number; publishedRevision: number; publicEnabled: number }>();
      const revision = Number(state?.draftRevision || 0);
      const expectedRevision = Number(body.expectedDraftRevision);
      if (!Number.isInteger(expectedRevision) || expectedRevision < 1)
        return Response.json({ error: "Valid draft revision required" }, { status: 400 });
      if (expectedRevision !== revision)
        return Response.json(
          { error: "Geo draft badal chuka hai. Refresh/review karke phir publish karein." },
          { status: 409 },
        );
      const features = await loadFeatures(projectId);
      if (!features.length || revision < 1)
        return Response.json({ error: "Publish se pehle kam se kam ek Geo feature save karein" }, { status: 400 });
      if (Number(state?.publishedRevision || 0) === revision && Boolean(state?.publicEnabled))
        return Response.json(await loadState(projectId));

      const controlPoints = await loadControlPoints(projectId);
      const generatedPlotFeatures = features.filter((feature) => feature.source === "plot_mapper");
      if (generatedPlotFeatures.length) {
        if (controlPoints.length < 4)
          return Response.json(
            { error: "Generated Geo plots ke liye saved calibration required hai" },
            { status: 409 },
          );
        const fingerprint = geoCalibrationFingerprint(controlPoints);
        const staleGenerated = generatedPlotFeatures.some(
          (feature) =>
            String(feature.properties?.calibrationFingerprint || "") !== fingerprint,
        );
        if (staleGenerated)
          return Response.json(
            {
              error:
                "Calibration ke baad Geo plots regenerate nahi hue. Generate Geo Plots karke review karein, phir publish karein.",
            },
            { status: 409 },
          );
      }

      const verifiedState = await env.DB.prepare(
        "SELECT draft_revision AS draftRevision FROM geo_project_settings WHERE project_id=?",
      )
        .bind(projectId)
        .first<{ draftRevision: number }>();
      if (Number(verifiedState?.draftRevision || 0) !== revision)
        return Response.json(
          { error: "Geo draft publish ke dauran badal gaya. Refresh karke retry karein." },
          { status: 409 },
        );
      const snapshot = JSON.stringify({
        schemaVersion: 1,
        revision,
        createdAt: now,
        featureCollection: featuresToFeatureCollection(features),
        controlPoints,
      });
      // Published snapshots are append-only. Re-enabling the same revision reuses
      // its original snapshot instead of overwriting historical evidence.
      await env.DB.prepare(
        "INSERT OR IGNORE INTO geo_versions (project_id,version,snapshot,created_at) VALUES (?,?,?,?)",
      )
        .bind(projectId, revision, snapshot, now)
        .run();
      const publishResult = await env.DB.prepare(
        "UPDATE geo_project_settings SET published_revision=?,public_enabled=1,published_at=?,updated_at=? WHERE project_id=? AND draft_revision=?",
      )
        .bind(revision, now, now, projectId, revision)
        .run();
      if (Number(publishResult.meta.changes || 0) !== 1)
        return Response.json(
          { error: "Geo draft publish se pehle badal gaya. Refresh karke retry karein." },
          { status: 409 },
        );
      await writeAudit(actor, "geo.published", projectId, String(revision), {
        featureCount: features.length,
      });
      return Response.json(await loadState(projectId));
    }

    if (body.action === "unpublish") {
      await env.DB.prepare(
        "UPDATE geo_project_settings SET public_enabled=0,updated_at=? WHERE project_id=?",
      )
        .bind(now, projectId)
        .run();
      await writeAudit(actor, "geo.unpublished", projectId, null, {});
      return Response.json(await loadState(projectId));
    }

    return Response.json({ error: "Geo Mapper action invalid hai" }, { status: 400 });
  } catch (error) {
    if (migrationPending(error))
      return Response.json({ error: "Geo Mapper migration pending hai" }, { status: 503 });
    const message = error instanceof Error ? error.message : "Geo Mapper request failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
