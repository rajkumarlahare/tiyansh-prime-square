import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { gallery } from "../../../../db/schema";
import { publicProjectId } from "../../../project-context";
import { getAdminSession } from "../../../admin-auth";

async function activeProjectId(projectId: string) {
  if (!projectId) return null;
  const row = await env.DB.prepare(
    "SELECT id FROM projects WHERE id=? AND status='active' LIMIT 1",
  )
    .bind(projectId)
    .first<{ id: string }>();
  return row?.id || null;
}

async function galleryProjectId(request: Request) {
  const session = await getAdminSession();
  const requested = new URL(request.url).searchParams.get("projectId");

  if (session?.role === "super_admin") {
    return activeProjectId(requested || session.projectId);
  }
  if (session?.role === "client_admin") {
    if (requested && requested !== session.projectId) return null;
    return activeProjectId(session.projectId);
  }
  return publicProjectId(request);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const projectId = await galleryProjectId(request);
    if (!projectId) return new Response("Not found", { status: 404 });
    const [item] = await getDb()
      .select()
      .from(gallery)
      .where(and(eq(gallery.projectId, projectId), eq(gallery.id, id)))
      .limit(1);
    if (!item) return new Response("Not found", { status: 404 });
    const object = await env.BUCKET.get(item.objectKey);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers({
      "content-type": item.contentType,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    });
    if (object.httpEtag) headers.set("etag", object.httpEtag);
    if (object.size) headers.set("content-length", String(object.size));
    return new Response(object.body, { headers });
  } catch (error) {
    console.error("Gallery image load failed", error);
    return new Response("Image load nahi hui", { status: 500 });
  }
}
