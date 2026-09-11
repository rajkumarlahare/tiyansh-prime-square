import { env } from "cloudflare:workers";
import { requireSuperAdmin, sameOrigin } from "../../admin-auth";
import { writeAudit } from "../../audit";

const denied = () =>
  Response.json({ error: "Super Admin access required" }, { status: 403 });
const MAPS_KEY_SETTING = "google_maps_browser_key";

type KeySource = "saved" | "env" | null;

function noStore(data: Record<string, unknown>, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "private,no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function runtime() {
  return env as unknown as Record<string, unknown>;
}

function normalizeMapsKey(value: unknown) {
  return String(value || "").trim();
}

function validMapsKey(value: string) {
  return /^[A-Za-z0-9_-]{20,200}$/.test(value);
}

function maskMapsKey(value: string) {
  if (!value) return null;
  return `••••••••${value.slice(-4)}`;
}

async function projectIsGeoLab(projectId: string) {
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

  if (!project) return { exists: false, lab: false };
  return { exists: true, lab: lab?.value === "1" };
}

async function resolveMapsKey(): Promise<{ apiKey: string; source: KeySource }> {
  const saved = await env.DB.prepare(
    "SELECT value FROM platform_settings WHERE key=? LIMIT 1",
  )
    .bind(MAPS_KEY_SETTING)
    .first<{ value: string }>();

  const savedValue = normalizeMapsKey(saved?.value);
  if (savedValue) return { apiKey: savedValue, source: "saved" };

  const envValue = normalizeMapsKey(runtime().GOOGLE_MAPS_BROWSER_KEY);
  return {
    apiKey: envValue,
    source: envValue ? "env" : null,
  };
}

function configResponse(
  lab: boolean,
  resolved: { apiKey: string; source: KeySource },
) {
  return {
    lab,
    mapsEnabled: Boolean(resolved.apiKey),
    apiKey: resolved.apiKey || null,
    configured: Boolean(resolved.apiKey),
    maskedKey: maskMapsKey(resolved.apiKey),
    keySource: resolved.source,
  };
}

export async function GET(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return denied();

  const projectId = new URL(request.url).searchParams.get("projectId")?.trim() || "";
  if (!projectId)
    return noStore({ error: "Project required" }, 400);

  const scope = await projectIsGeoLab(projectId);
  if (!scope.exists) return noStore({ error: "Project nahi mila" }, 404);
  if (!scope.lab)
    return noStore({
      lab: false,
      mapsEnabled: false,
      configured: false,
      maskedKey: null,
      keySource: null,
    });

  return noStore(configResponse(true, await resolveMapsKey()));
}

export async function POST(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return denied();
  if (!sameOrigin(request))
    return noStore({ error: "Invalid request origin" }, 403);

  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    action?: string;
    apiKey?: string;
  };
  const projectId = String(body.projectId || "").trim();
  if (!projectId)
    return noStore({ error: "Project required" }, 400);

  const scope = await projectIsGeoLab(projectId);
  if (!scope.exists) return noStore({ error: "Project nahi mila" }, 404);
  if (!scope.lab)
    return noStore({ error: "Maps settings sirf GEO LAB workspace me change ho sakti hain" }, 409);

  const now = new Date().toISOString();

  if (body.action === "save_key") {
    const apiKey = normalizeMapsKey(body.apiKey);
    if (!validMapsKey(apiKey))
      return noStore(
        { error: "Valid Google Maps browser API key paste karein" },
        400,
      );

    await env.DB.prepare(
      "INSERT INTO platform_settings (key,value,updated_at,updated_by) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
    )
      .bind(MAPS_KEY_SETTING, apiKey, now, actor.email)
      .run();

    await writeAudit(
      actor,
      "geo.maps_key_saved",
      projectId,
      MAPS_KEY_SETTING,
      { storage: "platform_settings", browserRestricted: true },
    );

    return noStore(configResponse(true, await resolveMapsKey()));
  }

  if (body.action === "clear_saved_key") {
    await env.DB.prepare(
      "DELETE FROM platform_settings WHERE key=?",
    )
      .bind(MAPS_KEY_SETTING)
      .run();

    await writeAudit(
      actor,
      "geo.maps_key_cleared",
      projectId,
      MAPS_KEY_SETTING,
      { storage: "platform_settings", fallback: "environment" },
    );

    return noStore(configResponse(true, await resolveMapsKey()));
  }

  return noStore({ error: "Unsupported maps settings action" }, 400);
}
