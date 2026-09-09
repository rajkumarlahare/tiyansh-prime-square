import { env } from "cloudflare:workers";
import { requireSuperAdmin, sameOrigin } from "../../../admin-auth";
import { writeAudit } from "../../../audit";
import {
  PROJECT_CONTACT_KEYS,
  missingRequiredProjectContact,
  pickProjectContactSettings,
  validateProjectContactPatch,
  withProjectContactFallbacks,
} from "../../../project-profile-policy";

const denied = () =>
  Response.json({ error: "Super Admin access required" }, { status: 403 });

async function loadProjectProfile(projectId: string) {
  const project = await env.DB.prepare(
    "SELECT id,name FROM projects WHERE id=? AND status!='deleted' LIMIT 1",
  )
    .bind(projectId)
    .first<{ id: string; name: string }>();
  if (!project) return null;

  const rows = await env.DB.prepare(
    "SELECT key,value FROM settings WHERE project_id=?",
  )
    .bind(projectId)
    .all<{ key: string; value: string }>();
  const raw = Object.fromEntries(rows.results.map((item) => [item.key, item.value]));
  const profile = pickProjectContactSettings(raw);
  const missing = missingRequiredProjectContact(profile);

  return {
    projectId,
    projectName: project.name,
    profile,
    effective: withProjectContactFallbacks(profile),
    missing,
    ready: missing.length === 0,
  };
}

export async function GET(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return denied();

  const projectId = new URL(request.url).searchParams.get("projectId") || "";
  if (!projectId)
    return Response.json({ error: "Project required" }, { status: 400 });

  const state = await loadProjectProfile(projectId);
  if (!state)
    return Response.json({ error: "Project nahi mila" }, { status: 404 });

  return Response.json(state, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return denied();
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid request origin" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    changes?: Record<string, unknown>;
  };
  const projectId = String(body.projectId || "").trim();
  if (!projectId)
    return Response.json({ error: "Project required" }, { status: 400 });

  const before = await loadProjectProfile(projectId);
  if (!before)
    return Response.json({ error: "Project nahi mila" }, { status: 404 });

  const checked = validateProjectContactPatch(body.changes || {});
  if (!checked.ok)
    return Response.json({ error: checked.error }, { status: 400 });

  const entries = Object.entries(checked.values);
  if (entries.length) {
    const now = new Date().toISOString();
    await env.DB.batch(
      entries.map(([key, value]) =>
        env.DB.prepare(
          "INSERT INTO settings (project_id,key,value,updated_at) VALUES (?,?,?,?) ON CONFLICT(project_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
        ).bind(projectId, key, value, now),
      ),
    );
    await writeAudit(actor, "project.profile_updated", projectId, null, {
      keys: entries.map(([key]) => key),
    });
  }

  const state = await loadProjectProfile(projectId);
  return Response.json(state, { headers: { "cache-control": "no-store" } });
}

// Keep this explicit reference so static architecture tests can assert that this
// API owns only canonical contact fields, never mapper/share internals.
void PROJECT_CONTACT_KEYS;
