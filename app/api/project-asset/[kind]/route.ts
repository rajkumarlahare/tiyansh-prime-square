import { env } from "cloudflare:workers";
import { getAdminSession } from "../../../admin-auth";
import { publicProjectId } from "../../../project-context";

const PUBLIC_KINDS = new Set(["masterplan", "sourcePdf"]);
const SUPER_ADMIN_ONLY = new Set([
  "sourceCad",
  "cadGeometry",
  "plotSheet",
  "masterplanOriginal",
]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind } = await params;
  if (![...PUBLIC_KINDS, ...SUPER_ADMIN_ONLY].includes(kind))
    return new Response("Not found", { status: 404 });

  const session = await getAdminSession();
  if (SUPER_ADMIN_ONLY.has(kind) && session?.role !== "super_admin")
    return new Response("Not found", { status: 404 });

  const requested = new URL(request.url).searchParams.get("projectId");
  const projectId =
    session?.role === "super_admin" && requested
      ? requested
      : session?.projectId || (await publicProjectId(request));
  if (!projectId) return new Response("Not found", { status: 404 });

  // Super Admin maps against the high-resolution masterplan. Public/client
  // traffic gets the lighter derivative when available.
  const storageKind =
    kind === "masterplan" && session?.role !== "super_admin"
      ? "masterplanPublic"
      : kind;
  let object = await env.BUCKET.get(`projects/${projectId}/mapper/${storageKind}`);
  if (!object && storageKind === "masterplanPublic") {
    object = await env.BUCKET.get(`projects/${projectId}/mapper/masterplan`);
  }
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "content-type": object.httpMetadata?.contentType || "application/octet-stream",
    "cache-control": session
      ? "no-store"
      : kind === "masterplan"
        ? "public,max-age=0,must-revalidate"
        : "public,max-age=3600",
    "x-content-type-options": "nosniff",
  });
  if (kind === "sourceCad" || kind === "plotSheet" || kind === "masterplanOriginal") {
    headers.set("content-disposition", "attachment");
  }
  if (object.httpEtag) headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
}
