import { env } from "cloudflare:workers";
import { projectBySlug } from "../../project-context";

async function liveSettings(projectId: string) {
  const keys = [
    "geoPublicEnabled",
    "geoPublicLabProjectId",
    "geoPublicOverlayKey",
    "geoPublicToken",
  ];
  const rows = await env.DB.prepare(
    `SELECT key,value FROM settings WHERE project_id=? AND key IN (${keys.map(() => "?").join(",")})`,
  )
    .bind(projectId, ...keys)
    .all<{ key: string; value: string }>();
  return new Map(rows.results.map((row) => [row.key, row.value]));
}

async function validLabLink(sourceProjectId: string, labProjectId: string) {
  const rows = await env.DB.prepare(
    "SELECT key,value FROM settings WHERE project_id=? AND key IN ('geoLabMode','geoLabSourceProjectId')",
  )
    .bind(labProjectId)
    .all<{ key: string; value: string }>();
  const values = new Map(rows.results.map((row) => [row.key, row.value]));
  return (
    values.get("geoLabMode") === "1" &&
    values.get("geoLabSourceProjectId") === sourceProjectId
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("projectSlug")?.trim() || "";
  if (!slug) return new Response("Not found", { status: 404 });

  const source = await projectBySlug(slug);
  if (!source) return new Response("Not found", { status: 404 });

  const live = await liveSettings(source.id);
  if (live.get("geoPublicEnabled") !== "1")
    return new Response("Not found", { status: 404 });

  const labProjectId = String(live.get("geoPublicLabProjectId") || "");
  const overlayKey = String(live.get("geoPublicOverlayKey") || "");
  const token = String(live.get("geoPublicToken") || "");
  if (!labProjectId || !overlayKey || !token)
    return new Response("Not found", { status: 404 });

  if (!(await validLabLink(source.id, labProjectId)))
    return new Response("Not found", { status: 404 });

  const expectedPrefix = `projects/${labProjectId}/geo/promoted/`;
  if (!overlayKey.startsWith(expectedPrefix))
    return new Response("Not found", { status: 404 });

  const requestedToken = url.searchParams.get("v") || "";
  if (requestedToken && requestedToken !== token)
    return new Response("Not found", { status: 404 });

  const object = await env.BUCKET.get(overlayKey);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "content-type": object.httpMetadata?.contentType || "image/png",
    "cache-control": requestedToken
      ? "public,max-age=31536000,immutable"
      : "public,max-age=0,must-revalidate",
    "x-content-type-options": "nosniff",
    "x-rekixo-project": source.id,
  });
  if (object.httpEtag) headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
}
