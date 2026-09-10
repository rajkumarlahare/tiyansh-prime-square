import { env } from "cloudflare:workers";
import { requireSuperAdmin } from "../../admin-auth";

const denied = () =>
  Response.json({ error: "Super Admin access required" }, { status: 403 });

function noStore(data: Record<string, unknown>, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "private,no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function GET(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return denied();

  const projectId = new URL(request.url).searchParams.get("projectId")?.trim() || "";
  if (!projectId)
    return noStore({ error: "Project required" }, 400);

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

  if (!project) return noStore({ error: "Project nahi mila" }, 404);
  if (lab?.value !== "1")
    return noStore({
      lab: false,
      mapsEnabled: false,
    });

  // Browser API keys are visible to the browser by design. Keep the key out of
  // source control anyway, and restrict it in Google Cloud to admin.rekixo.com
  // plus the Maps JavaScript API.
  const runtime = env as unknown as Record<string, unknown>;
  const apiKey = String(runtime.GOOGLE_MAPS_BROWSER_KEY || "").trim();

  return noStore({
    lab: true,
    mapsEnabled: Boolean(apiKey),
    apiKey: apiKey || null,
  });
}
