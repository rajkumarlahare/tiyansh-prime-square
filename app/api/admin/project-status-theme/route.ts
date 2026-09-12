import { env } from "cloudflare:workers";
import { requireSuperAdmin, sameOrigin } from "../../../admin-auth";
import { writeAudit } from "../../../audit";

const STATUS_THEME = {
  available: { key: "plotStatusAvailableColor", fallback: "#12C568" },
  booked: { key: "plotStatusBookedColor", fallback: "#F5B516" },
  sold: { key: "plotStatusSoldColor", fallback: "#F0314C" },
} as const;

type StatusKey = keyof typeof STATUS_THEME;
const STATUS_KEYS = Object.keys(STATUS_THEME) as StatusKey[];
const denied = () => Response.json({ error: "Super Admin access required" }, { status: 403 });

function normalizeHex(value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase();
  const match = raw.match(/^#?([0-9A-F]{6})$/);
  return match ? `#${match[1]}` : null;
}

async function loadTheme(projectId: string) {
  const project = await env.DB.prepare("SELECT id,name FROM projects WHERE id=? AND status!='deleted' LIMIT 1").bind(projectId).first<{ id: string; name: string }>();
  if (!project) return null;
  const keys = STATUS_KEYS.map((status) => STATUS_THEME[status].key);
  const rows = await env.DB.prepare("SELECT key,value FROM settings WHERE project_id=? AND key IN (?,?,?)").bind(projectId, ...keys).all<{ key: string; value: string }>();
  const raw = Object.fromEntries(rows.results.map((item) => [item.key, item.value]));
  const colors = {} as Record<StatusKey, string>;
  const custom = {} as Record<StatusKey, boolean>;
  for (const status of STATUS_KEYS) {
    const config = STATUS_THEME[status];
    const normalized = normalizeHex(raw[config.key]);
    colors[status] = normalized || config.fallback;
    custom[status] = Boolean(normalized);
  }
  return { projectId, projectName: project.name, colors, custom };
}

export async function GET(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return denied();
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim() || "";
  if (!projectId) return Response.json({ error: "Project required" }, { status: 400 });
  const state = await loadTheme(projectId);
  if (!state) return Response.json({ error: "Project nahi mila" }, { status: 404 });
  return Response.json(state, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return denied();
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { projectId?: string; changes?: Partial<Record<StatusKey, string | null>> };
  const projectId = String(body.projectId || "").trim();
  if (!projectId) return Response.json({ error: "Project required" }, { status: 400 });
  const before = await loadTheme(projectId);
  if (!before) return Response.json({ error: "Project nahi mila" }, { status: 404 });
  const changes = body.changes && typeof body.changes === "object" ? body.changes : {};
  const requestedKeys = Object.keys(changes);
  if (requestedKeys.some((key) => !STATUS_KEYS.includes(key as StatusKey))) return Response.json({ error: "Invalid status color key" }, { status: 400 });

  const now = new Date().toISOString();
  const statements: ReturnType<typeof env.DB.prepare>[] = [];
  const auditChanges: Record<string, string | null> = {};
  for (const status of STATUS_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(changes, status)) continue;
    const value = changes[status];
    const settingKey = STATUS_THEME[status].key;
    if (value === null || String(value).trim() === "") {
      statements.push(env.DB.prepare("DELETE FROM settings WHERE project_id=? AND key=?").bind(projectId, settingKey));
      auditChanges[status] = null;
      continue;
    }
    const normalized = normalizeHex(value);
    if (!normalized) return Response.json({ error: `${status} color valid #RRGGBB format me hona chahiye` }, { status: 400 });
    statements.push(env.DB.prepare("INSERT INTO settings (project_id,key,value,updated_at) VALUES (?,?,?,?) ON CONFLICT(project_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(projectId, settingKey, normalized, now));
    auditChanges[status] = normalized;
  }
  if (statements.length) {
    await env.DB.batch(statements);
    await writeAudit(actor, "project.status_theme_updated", projectId, null, { changes: auditChanges });
  }
  const state = await loadTheme(projectId);
  return Response.json(state, { headers: { "cache-control": "no-store" } });
}
