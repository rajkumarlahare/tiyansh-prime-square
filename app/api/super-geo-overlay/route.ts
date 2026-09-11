import { env } from "cloudflare:workers";
import { requireSuperAdmin, sameOrigin } from "../../admin-auth";
import { writeAudit } from "../../audit";

const denied = () =>
  Response.json({ error: "Super Admin access required" }, { status: 403 });

async function isGeoLab(projectId: string) {
  const [project, lab] = await Promise.all([
    env.DB.prepare(
      "SELECT id FROM projects WHERE id=? AND status='active' LIMIT 1",
    )
      .bind(projectId)
      .first<{ id: string }>(),
    env.DB.prepare(
      "SELECT value FROM settings WHERE project_id=? AND key='geoLabMode' LIMIT 1",
    )
      .bind(projectId)
      .first<{ value: string }>(),
  ]);
  return Boolean(project && lab?.value === "1");
}

export async function GET(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return denied();

  const projectId = new URL(request.url).searchParams.get("projectId")?.trim() || "";
  if (!projectId)
    return Response.json({ error: "Geo Lab project required" }, { status: 400 });
  if (!(await isGeoLab(projectId)))
    return Response.json({ error: "GEO LAB required" }, { status: 409 });

  const object = await env.BUCKET.head(`projects/${projectId}/geo/public-overlay.png`);
  return Response.json(
    {
      saved: Boolean(object),
      etag: object?.httpEtag || null,
      size: Number(object?.size || 0),
    },
    { headers: { "cache-control": "private,no-store" } },
  );
}

export async function POST(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return denied();
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid request origin" }, { status: 403 });

  const form = await request.formData().catch(() => null);
  if (!form)
    return Response.json({ error: "Overlay upload invalid hai" }, { status: 400 });

  const projectId = String(form.get("projectId") || "").trim();
  const file = form.get("file");
  if (!projectId || !(file instanceof File))
    return Response.json({ error: "Project aur PNG required" }, { status: 400 });
  if (!(await isGeoLab(projectId)))
    return Response.json({ error: "Live overlay sirf GEO LAB me save ho sakta hai" }, { status: 409 });
  if (file.type !== "image/png")
    return Response.json({ error: "Live overlay PNG hona chahiye" }, { status: 400 });
  if (file.size < 1 || file.size > 40 * 1024 * 1024)
    return Response.json({ error: "Live overlay 40 MB se chhota rakhein" }, { status: 400 });

  const key = `projects/${projectId}/geo/public-overlay.png`;
  const buffer = await file.arrayBuffer();
  await env.BUCKET.put(key, buffer, {
    httpMetadata: { contentType: "image/png" },
    customMetadata: {
      savedAt: new Date().toISOString(),
      savedBy: actor.email,
    },
  });

  await writeAudit(actor, "geo.public_overlay_saved", projectId, "public-overlay.png", {
    bytes: file.size,
    contentType: file.type,
  });

  return Response.json(
    { ok: true, saved: true, bytes: file.size },
    { headers: { "cache-control": "private,no-store" } },
  );
}
