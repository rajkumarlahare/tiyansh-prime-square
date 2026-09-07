import { getDb } from "../../../db";
import { gallery, plots, settings } from "../../../db/schema";
import { desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { publicProjectId } from "../../project-context";

export async function GET(request: Request) {
  try {
    const db = getDb();
    const projectId = await publicProjectId(request);
    if (!projectId) {
      return Response.json(
        { error: "Project domain configured nahi hai" },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }

    const [project, plotRows, settingRows, galleryRows] = await Promise.all([
      env.DB.prepare(
        "SELECT name FROM projects WHERE id=? AND status='active' LIMIT 1",
      )
        .bind(projectId)
        .first<{ name: string }>(),
      db.select().from(plots).where(eq(plots.projectId, projectId)),
      db.select().from(settings).where(eq(settings.projectId, projectId)),
      db
        .select({ id: gallery.id, caption: gallery.caption, filename: gallery.filename })
        .from(gallery)
        .where(eq(gallery.projectId, projectId))
        .orderBy(desc(gallery.sortOrder)),
    ]);

    return Response.json(
      {
        projectId,
        projectName: project?.name || "Project",
        plots: plotRows,
        settings: Object.fromEntries(settingRows.map((item) => [item.key, item.value])),
        gallery: galleryRows,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("Public data load failed", error);
    return Response.json(
      { error: "Project data unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
