import { env } from "cloudflare:workers";
import { requireSuperAdmin, sameOrigin } from "../../admin-auth";
import { writeAudit } from "../../audit";

const denied = () => Response.json({ error: "Super Admin access required" }, { status: 403 });
const LAB_NAME = /\bGEO[\s_-]*LAB\b/i;
const CONFIRMATION = "CLONE TO GEO LAB";
const MAPPER_ASSETS = [
  "masterplan",
  "masterplanOriginal",
  "masterplanPublic",
  "sourceCad",
  "sourcePdf",
  "plotSheet",
  "cadGeometry",
] as const;
const MAPPER_SETTINGS = [
  "masterplanName",
  "masterplanOriginalName",
  "mapWidth",
  "mapHeight",
  "masterplanOriginalWidth",
  "masterplanOriginalHeight",
  "sourceCadName",
  "sourcePdfName",
  "plotSheetName",
  "plotSheetCount",
  "cadBounds",
  "cadCandidateCount",
  "cadParseError",
  "publicRotation",
] as const;

type ProjectRow = {
  id: string;
  name: string;
  status: string;
  publicStatus: string;
  publicHost: string | null;
  adminHost: string | null;
};

function validNormalizedPolygon(raw: string) {
  try {
    const points = JSON.parse(raw) as unknown;
    return (
      Array.isArray(points) &&
      points.length >= 3 &&
      points.length <= 80 &&
      points.every(
        (point) =>
          Array.isArray(point) &&
          point.length === 2 &&
          point.every(
            (value) =>
              typeof value === "number" &&
              Number.isFinite(value) &&
              value >= 0 &&
              value <= 1,
          ),
      )
    );
  } catch {
    return false;
  }
}

async function project(projectId: string) {
  return env.DB.prepare(
    "SELECT id,name,status,public_status AS publicStatus,public_host AS publicHost,admin_host AS adminHost FROM projects WHERE id=? AND status!='deleted' LIMIT 1",
  )
    .bind(projectId)
    .first<ProjectRow>();
}

async function copyMapperAsset(sourceProjectId: string, destinationProjectId: string, name: string) {
  const sourceKey = `projects/${sourceProjectId}/mapper/${name}`;
  const destinationKey = `projects/${destinationProjectId}/mapper/${name}`;
  const object = await env.BUCKET.get(sourceKey);
  if (!object) return null;
  await env.BUCKET.put(destinationKey, object.body, {
    httpMetadata: object.httpMetadata,
    customMetadata: object.customMetadata,
  });
  return destinationKey;
}

export async function POST(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return denied();
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid request origin" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    sourceProjectId?: string;
    confirmation?: string;
  };
  const destinationProjectId = String(body.projectId || "").trim();
  const sourceProjectId = String(body.sourceProjectId || "").trim();

  if (!destinationProjectId || !sourceProjectId)
    return Response.json({ error: "Source aur destination project required" }, { status: 400 });
  if (body.confirmation !== CONFIRMATION)
    return Response.json({ error: `Type exactly: ${CONFIRMATION}` }, { status: 400 });
  if (sourceProjectId === destinationProjectId)
    return Response.json({ error: "Source aur Geo Lab same project nahi ho sakte" }, { status: 409 });

  const [source, destination] = await Promise.all([
    project(sourceProjectId),
    project(destinationProjectId),
  ]);
  if (!source) return Response.json({ error: "Source project nahi mila" }, { status: 404 });
  if (!destination) return Response.json({ error: "Destination project nahi mila" }, { status: 404 });

  // Explicit destination guard: a stable customer project can never be a clone target.
  if (!LAB_NAME.test(destination.name))
    return Response.json({ error: "Destination project name me GEO LAB hona required hai" }, { status: 409 });
  if (destination.publicStatus !== "draft" || destination.publicHost || destination.adminHost)
    return Response.json({ error: "Geo Lab draft aur domainless hona chahiye" }, { status: 409 });

  const [
    domainCount,
    destinationPlotCount,
    sourcePlots,
    sourceSettings,
    sourceLab,
    geoState,
    geoCounts,
    destinationObjects,
  ] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS total FROM project_domains WHERE project_id=? AND status='active'")
      .bind(destinationProjectId)
      .first<{ total: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM plots WHERE project_id=?")
      .bind(destinationProjectId)
      .first<{ total: number }>(),
    env.DB.prepare("SELECT id,polygon FROM plots WHERE project_id=? ORDER BY id")
      .bind(sourceProjectId)
      .all<{ id: string; polygon: string }>(),
    env.DB.prepare(
      `SELECT key,value FROM settings WHERE project_id=? AND key IN (${MAPPER_SETTINGS.map(() => "?").join(",")})`,
    )
      .bind(sourceProjectId, ...MAPPER_SETTINGS)
      .all<{ key: string; value: string }>(),
    env.DB.prepare("SELECT value FROM settings WHERE project_id=? AND key='geoLabMode' LIMIT 1")
      .bind(sourceProjectId)
      .first<{ value: string }>(),
    env.DB.prepare(
      "SELECT draft_revision AS draftRevision,published_revision AS publishedRevision,public_enabled AS publicEnabled FROM geo_project_settings WHERE project_id=?",
    )
      .bind(destinationProjectId)
      .first<{ draftRevision: number; publishedRevision: number; publicEnabled: number }>(),
    Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS total FROM geo_features WHERE project_id=?")
        .bind(destinationProjectId)
        .first<{ total: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM geo_control_points WHERE project_id=?")
        .bind(destinationProjectId)
        .first<{ total: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM geo_sources WHERE project_id=?")
        .bind(destinationProjectId)
        .first<{ total: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM geo_versions WHERE project_id=?")
        .bind(destinationProjectId)
        .first<{ total: number }>(),
    ]),
    env.BUCKET.list({ prefix: `projects/${destinationProjectId}/mapper/`, limit: 1 }),
  ]);

  if (sourceLab?.value === "1")
    return Response.json({ error: "Geo Lab ko source project nahi bana sakte" }, { status: 409 });
  if (Number(domainCount?.total || 0) > 0)
    return Response.json({ error: "Geo Lab me active domain nahi hona chahiye" }, { status: 409 });
  if (Number(destinationPlotCount?.total || 0) > 0)
    return Response.json({ error: "Geo Lab plot inventory empty hona chahiye" }, { status: 409 });
  if (destinationObjects.objects.length > 0)
    return Response.json({ error: "Geo Lab mapper source folder empty hona chahiye" }, { status: 409 });
  if (
    geoState &&
    (Number(geoState.draftRevision) ||
      Number(geoState.publishedRevision) ||
      Boolean(geoState.publicEnabled))
  )
    return Response.json({ error: "Geo Lab me existing Geo draft/publish data mila" }, { status: 409 });
  if (geoCounts.some((item) => Number(item?.total || 0) > 0))
    return Response.json({ error: "Geo Lab workspace empty hona chahiye" }, { status: 409 });
  if (!sourcePlots.results.length)
    return Response.json({ error: "Source project me plots nahi mile" }, { status: 409 });

  const invalid = sourcePlots.results.filter((plot) => !validNormalizedPolygon(plot.polygon));
  if (invalid.length)
    return Response.json(
      { error: `Source project ke ${invalid.length} plots mapped/valid nahi hain` },
      { status: 409 },
    );

  const sourceMasterplan = await env.BUCKET.head(`projects/${sourceProjectId}/mapper/masterplan`);
  if (!sourceMasterplan)
    return Response.json({ error: "Source project masterplan missing hai" }, { status: 409 });

  const copiedKeys: string[] = [];
  const now = new Date().toISOString();

  try {
    // Source side is R2 GET/HEAD only. Every PUT uses the new destination project key.
    for (const asset of MAPPER_ASSETS) {
      const copied = await copyMapperAsset(sourceProjectId, destinationProjectId, asset);
      if (copied) copiedKeys.push(copied);
    }

    const statements = [
      env.DB.prepare(
        "INSERT INTO plots (project_id,id,sqft,sqm,sqyd,dimensions,road,polygon,status,notes,featured,updated_at) SELECT ?,id,sqft,sqm,sqyd,dimensions,road,polygon,'available','',0,? FROM plots WHERE project_id=?",
      ).bind(destinationProjectId, now, sourceProjectId),
      ...sourceSettings.results.map((item) =>
        env.DB.prepare(
          "INSERT OR REPLACE INTO settings (project_id,key,value,updated_at) VALUES (?,?,?,?)",
        ).bind(destinationProjectId, item.key, item.value, now),
      ),
      env.DB.prepare(
        "INSERT OR REPLACE INTO settings (project_id,key,value,updated_at) VALUES (?,'geoLabMode','1',?)",
      ).bind(destinationProjectId, now),
      env.DB.prepare(
        "INSERT OR REPLACE INTO settings (project_id,key,value,updated_at) VALUES (?,'geoLabSourceProjectId',?,?)",
      ).bind(destinationProjectId, sourceProjectId, now),
      env.DB.prepare(
        "INSERT OR REPLACE INTO settings (project_id,key,value,updated_at) VALUES (?,'geoLabSourceProjectName',?,?)",
      ).bind(destinationProjectId, source.name.slice(0, 160), now),
      env.DB.prepare(
        "INSERT OR REPLACE INTO settings (project_id,key,value,updated_at) VALUES (?,'geoLabCreatedAt',?,?)",
      ).bind(destinationProjectId, now, now),
    ];

    // Existing codebase already uses DB.batch for grouped project mutations.
    await env.DB.batch(statements);
  } catch (error) {
    // D1 batch is grouped; R2 is not transactional, so roll back only destination copies.
    await Promise.allSettled(copiedKeys.map((key) => env.BUCKET.delete(key)));
    console.error("Geo Lab clone failed", error);
    return Response.json({ error: "Geo Lab clone safely complete nahi hua" }, { status: 500 });
  }

  try {
    await writeAudit(actor, "geo.lab_cloned", destinationProjectId, sourceProjectId, {
      sourceProjectName: source.name,
      plotCount: sourcePlots.results.length,
      mapperAssets: copiedKeys.map((key) => key.split("/").pop()),
      businessStatusCopied: false,
      notesCopied: false,
      domainsCopied: false,
    });
  } catch (error) {
    console.error("Geo Lab clone audit write failed", error);
  }

  return Response.json({
    ok: true,
    source: { id: source.id, name: source.name },
    destination: { id: destination.id, name: destination.name },
    plots: sourcePlots.results.length,
    assets: copiedKeys.length,
    publicLocked: true,
  });
}
