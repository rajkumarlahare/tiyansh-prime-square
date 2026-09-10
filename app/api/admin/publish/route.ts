import { env } from "cloudflare:workers";
import { requireSuperAdmin, sameOrigin } from "../../../admin-auth";
import { writeAudit } from "../../../audit";
import { activeProjectDomain } from "../../../project-domains";
import { currentProjectLinks } from "../../../project-links";
import { missingRequiredProjectContact } from "../../../project-profile-policy";

const denied = () => Response.json({ error: "Super Admin access required" }, { status: 403 });
const LEGACY_PROJECT = "tiyansh-prime-square";

function validPolygon(raw: string) {
  try {
    const points = JSON.parse(raw);
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

async function publishState(projectId: string) {
  const project = await env.DB.prepare(
    "SELECT id,name,slug,status,public_status AS publicStatus,published_at AS publishedAt,publish_version AS publishVersion,public_host AS publicHost,admin_host AS adminHost FROM projects WHERE id=? AND status!='deleted' LIMIT 1",
  )
    .bind(projectId)
    .first<{
      id: string;
      name: string;
      slug: string;
      status: string;
      publicStatus: string;
      publishedAt: string | null;
      publishVersion: number;
      publicHost: string | null;
      adminHost: string | null;
    }>();
  if (!project) return null;

  const [plotResult, settingsResult] = await Promise.all([
    env.DB.prepare("SELECT id,polygon FROM plots WHERE project_id=? ORDER BY id")
      .bind(projectId)
      .all<{ id: string; polygon: string }>(),
    env.DB.prepare(
      "SELECT key,value FROM settings WHERE project_id=? AND key IN ('masterplanName','mapWidth','mapHeight','shareTitle','shareDescription','shareImage','location','address','phone1','geoLabMode')",
    )
      .bind(projectId)
      .all<{ key: string; value: string }>(),
  ]);

  const settings = Object.fromEntries(
    settingsResult.results.map((item) => [item.key, item.value]),
  );
  const plots = plotResult.results;
  const mapped = plots.filter((plot) => Boolean(plot.polygon)).length;
  const invalid = plots.filter(
    (plot) => Boolean(plot.polygon) && !validPolygon(plot.polygon),
  ).length;
  const legacy = projectId === LEGACY_PROJECT;
  const geoLab = settings.geoLabMode === "1";
  const reasons: string[] = [];

  if (!legacy) {
    if (geoLab) reasons.push("Geo Lab project public publish ke liye locked hai");
    if (!settings.masterplanName) reasons.push("Masterplan image upload required");
    if (!settings.mapWidth || !settings.mapHeight) reasons.push("Masterplan dimensions missing");
    if (!settings.shareTitle) reasons.push("Share title required");
    if (!settings.shareDescription) reasons.push("Share description required");
    if (!settings.shareImage) reasons.push("Share preview image required");
    for (const key of missingRequiredProjectContact(settings)) {
      if (key === "location") reasons.push("Project location required");
      if (key === "address") reasons.push("Full address required");
      if (key === "phone1") reasons.push("Primary phone required");
    }
    if (!plots.length) reasons.push("Plot inventory empty");
    if (mapped !== plots.length)
      reasons.push(`${plots.length - mapped} plots ki boundary pending hai`);
    if (invalid) reasons.push(`${invalid} invalid polygon boundaries hain`);
  }

  const [primaryDomain, primaryAdminDomain] = await Promise.all([
    activeProjectDomain(projectId, "public"),
    activeProjectDomain(projectId, "admin"),
  ]);
  const links = currentProjectLinks(
    project.slug,
    primaryDomain || project.publicHost,
    primaryAdminDomain || project.adminHost,
  );

  return {
    ...project,
    total: plots.length,
    mapped,
    invalid,
    masterplanReady: legacy || Boolean(settings.masterplanName),
    ready: reasons.length === 0,
    reasons,
    primaryDomain: primaryDomain || project.publicHost,
    primaryAdminDomain: primaryAdminDomain || project.adminHost,
    ...links,
    legacy,
    geoLab,
  };
}

export async function GET(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return denied();
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return Response.json({ error: "Project required" }, { status: 400 });
  const state = await publishState(projectId);
  if (!state) return Response.json({ error: "Project nahi mila" }, { status: 404 });
  return Response.json(state, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return denied();
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid request origin" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    action?: "publish" | "unpublish";
  };
  const projectId = String(body.projectId || "");
  const action = body.action;
  if (!projectId || !["publish", "unpublish"].includes(String(action)))
    return Response.json({ error: "Invalid publish request" }, { status: 400 });

  const state = await publishState(projectId);
  if (!state) return Response.json({ error: "Project nahi mila" }, { status: 404 });

  const now = new Date().toISOString();
  if (action === "publish") {
    if (state.geoLab)
      return Response.json(
        { error: "Geo Lab project ko public publish nahi kiya ja sakta" },
        { status: 409 },
      );
    if (!state.ready)
      return Response.json(
        { error: "Project publish-ready nahi hai", reasons: state.reasons },
        { status: 409 },
      );
    await env.DB.prepare(
      "UPDATE projects SET public_status='published',published_at=?,publish_version=publish_version+1,updated_at=? WHERE id=?",
    )
      .bind(now, now, projectId)
      .run();
    await writeAudit(actor, "project.published", projectId, null, {
      mapped: state.mapped,
      total: state.total,
      previousVersion: state.publishVersion,
    });
  } else {
    if (projectId === LEGACY_PROJECT)
      return Response.json(
        { error: "Tiyansh legacy reference ko unpublish nahi kiya ja sakta" },
        { status: 409 },
      );
    await env.DB.prepare(
      "UPDATE projects SET public_status='draft',updated_at=? WHERE id=?",
    )
      .bind(now, projectId)
      .run();
    await writeAudit(actor, "project.unpublished", projectId, null);
  }

  const next = await publishState(projectId);
  return Response.json(next, { headers: { "cache-control": "no-store" } });
}
