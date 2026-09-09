import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { gallery, plots, settings } from "../../../db/schema";
import { desc, eq } from "drizzle-orm";
import { sameOrigin, validAdminSession } from "../../admin-auth";
import { isClientEditableSettingKey, pickClientVisibleSettings, validClientPlotStatus } from "../../client-admin-policy";
import { writeAudit } from "../../audit";

const denied = () => Response.json({ error: "Admin login required" }, { status: 401 });

export async function GET(request: Request) {
  const session = await validAdminSession();
  if (!session) return denied();
  try {
    const db = getDb();
    const requested = new URL(request.url).searchParams.get("projectId");
    const projectId =
      session.role === "super_admin" && requested ? requested : session.projectId;

    const [project, plotRows, settingRows, galleryRows] = await Promise.all([
      env.DB.prepare(
        "SELECT name,public_host AS publicHost,admin_host AS adminHost FROM projects WHERE id=? AND status!='deleted' LIMIT 1",
      )
        .bind(projectId)
        .first<{ name: string; publicHost: string | null; adminHost: string | null }>(),
      db.select().from(plots).where(eq(plots.projectId, projectId)),
      db.select().from(settings).where(eq(settings.projectId, projectId)),
      db
        .select()
        .from(gallery)
        .where(eq(gallery.projectId, projectId))
        .orderBy(desc(gallery.sortOrder)),
    ]);
    const allSettings = Object.fromEntries(settingRows.map((item) => [item.key, item.value]));

    return Response.json(
      {
        projectId,
        projectName: project?.name || "Project",
        publicHost: project?.publicHost || null,
        adminHost: project?.adminHost || null,
        plots: plotRows,
        settings: session.role === "client_admin" ? pickClientVisibleSettings(allSettings) : allSettings,
        gallery: galleryRows,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("Admin data load failed", error);
    return Response.json({ error: "Data load nahi hua" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const session = await validAdminSession();
  if (!session) return denied();

  try {
    const body = (await request.json()) as {
      type?: string;
      plot?: Record<string, unknown>;
      settings?: Record<string, string>;
      plotId?: string;
      status?: string;
    };
    const db = getDb();
    const now = new Date().toISOString();
    const projectId = session.projectId;

    if (body.type === "plotStatus") {
      const plotId = String(body.plotId || "").trim();
      const status = String(body.status || "");
      if (!plotId || plotId.length > 80 || !validClientPlotStatus(status))
        return Response.json({ error: "Invalid plot status" }, { status: 400 });
      const existing = await env.DB.prepare("SELECT id FROM plots WHERE project_id=? AND id=? LIMIT 1").bind(projectId, plotId).first();
      if (!existing) return Response.json({ error: "Plot nahi mila" }, { status: 404 });
      await env.DB.prepare("UPDATE plots SET status=?, updated_at=? WHERE project_id=? AND id=?").bind(status, now, projectId, plotId).run();
      await writeAudit(session, "project.plot_status_updated", projectId, plotId, { status });
      return Response.json({ ok: true, plotId, status });
    }

    if (session.role === "client_admin" && body.type === "plot")
      return Response.json({ error: "Client can update plot status only" }, { status: 403 });

    if (body.type === "plot" && body.plot?.id) {
      const p = body.plot;
      const status = String(p.status ?? "available");
      const numbers = [Number(p.sqft), Number(p.sqm), Number(p.sqyd)];
      const polygon = String(p.polygon ?? "");
      if (
        !["available", "booked", "sold"].includes(status) ||
        numbers.some((value) => !Number.isFinite(value) || value < 0) ||
        polygon.length > 12000
      ) {
        return Response.json({ error: "Invalid plot data" }, { status: 400 });
      }
      if (polygon) {
        try {
          const points = JSON.parse(polygon);
          if (
            !Array.isArray(points) ||
            points.length < 3 ||
            points.length > 80 ||
            points.some(
              (point) =>
                !Array.isArray(point) ||
                point.length !== 2 ||
                point.some(
                  (value: unknown) =>
                    typeof value !== "number" || value < 0 || value > 1,
                ),
            )
          ) {
            throw new Error();
          }
        } catch {
          return Response.json({ error: "Invalid plot boundary" }, { status: 400 });
        }
      }

      const row = {
        projectId,
        id: String(p.id).slice(0, 80),
        sqft: numbers[0],
        sqm: numbers[1],
        sqyd: numbers[2],
        dimensions: String(p.dimensions ?? "").slice(0, 120),
        road: String(p.road ?? "").slice(0, 160),
        polygon,
        status,
        notes: String(p.notes ?? "").slice(0, 2000),
        featured: Boolean(p.featured),
        updatedAt: now,
      };
      await db
        .insert(plots)
        .values(row)
        .onConflictDoUpdate({ target: [plots.projectId, plots.id], set: row });
      await writeAudit(session, "project.plot_updated", projectId, row.id, {
        status,
        boundary: Boolean(polygon),
      });
      return Response.json({ ok: true, plot: row });
    }

    if (body.type === "settings" && body.settings) {
      const rawEntries = Object.entries(body.settings);
      if (session.role === "client_admin" && rawEntries.some(([key]) => !isClientEditableSettingKey(key)))
        return Response.json({ error: "Client setting not allowed" }, { status: 403 });
      const entries = rawEntries
        .filter(([key, value]) => key.length <= 80 && typeof value === "string")
        .map(([key, value]) => [key, value.slice(0, 2000)] as const);
      if (!entries.length) {
        return Response.json({ error: "Invalid settings" }, { status: 400 });
      }
      await db.batch(
        entries.map(([key, value]) =>
          db
            .insert(settings)
            .values({ projectId, key, value, updatedAt: now })
            .onConflictDoUpdate({
              target: [settings.projectId, settings.key],
              set: { value, updatedAt: now },
            }),
        ),
      );
      await writeAudit(session, "project.settings_updated", projectId, null, {
        keys: entries.map(([key]) => key),
      });
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Invalid request" }, { status: 400 });
  } catch (error) {
    console.error("Admin data save failed", error);
    return Response.json({ error: "Save nahi hua" }, { status: 500 });
  }
}
