import { getDb } from "../../../db";
import { gallery, plots, settings } from "../../../db/schema";
import { desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getAdminSession } from "../../admin-auth";
import { publicProjectId } from "../../project-context";
import { activeProjectDomain } from "../../project-domains";
import { currentProjectLinks } from "../../project-links";

const PUBLIC_SETTING_KEYS = new Set([
  "projectName",
  "brandName",
  "brandShort",
  "template",
  "accentColor",
  "location",
  "address",
  "phone1",
  "phone2",
  "whatsapp",
  "mapUrl",
  "brochureUrl",
  "masterplanName",
  "mapWidth",
  "mapHeight",
  "publicRotation",
  "logoName",
  "logoVersion",
  "shareTitle",
  "shareDescription",
  "shareImage",
]);

async function previewProjectId(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("preview") !== "1") return null;
  const requested = url.searchParams.get("projectId");
  if (!requested) return null;
  const session = await getAdminSession();
  if (!session) return null;
  if (session.role !== "super_admin" && session.projectId !== requested) return null;
  const row = await env.DB.prepare(
    "SELECT id FROM projects WHERE id=? AND status='active' LIMIT 1",
  )
    .bind(requested)
    .first<{ id: string }>();
  return row?.id || null;
}

export async function GET(request: Request) {
  try {
    const db = getDb();
    const previewId = await previewProjectId(request);
    const projectId = previewId || (await publicProjectId(request));
    if (!projectId) {
      return Response.json(
        { error: "Project domain configured/published nahi hai" },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }

    const [project, plotRows, settingRows, galleryRows, adminDomain] =
      await Promise.all([
        env.DB.prepare(
          "SELECT name,slug,public_status AS publicStatus,published_at AS publishedAt,publish_version AS publishVersion,admin_host AS adminHost FROM projects WHERE id=? AND status='active' LIMIT 1",
        )
          .bind(projectId)
          .first<{
            name: string;
            slug: string;
            publicStatus: string;
            publishedAt: string | null;
            publishVersion: number;
            adminHost: string | null;
          }>(),
        db.select().from(plots).where(eq(plots.projectId, projectId)),
        db.select().from(settings).where(eq(settings.projectId, projectId)),
        db
          .select({ id: gallery.id, caption: gallery.caption, filename: gallery.filename })
          .from(gallery)
          .where(eq(gallery.projectId, projectId))
          .orderBy(desc(gallery.sortOrder)),
        activeProjectDomain(projectId, "admin"),
      ]);

    if (!project) {
      return Response.json(
        { error: "Project unavailable" },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }

    const adminHost = adminDomain || project.adminHost;
    const links = currentProjectLinks(project.slug, null, adminHost);

    return Response.json(
      {
        projectId,
        projectName: project.name || "Project",
        slug: project.slug,
        preview: Boolean(previewId),
        publishVersion: project.publishVersion,
        publishedAt: project.publishedAt,
        adminUrl: links.adminUrl,
        platformUrl: links.platformUrl,
        plots: plotRows,
        settings: Object.fromEntries(
          settingRows
            .filter((item) => PUBLIC_SETTING_KEYS.has(item.key))
            .map((item) => [item.key, item.value]),
        ),
        gallery: galleryRows,
      },
      {
        headers: {
          "cache-control": "no-store",
          "x-rekixo-project": projectId,
          "x-rekixo-publish-version": String(project.publishVersion || 0),
        },
      },
    );
  } catch (error) {
    console.error("Public data load failed", error);
    return Response.json(
      { error: "Project data unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
