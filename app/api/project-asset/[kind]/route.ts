import { env } from "cloudflare:workers";
import { getAdminSession } from "../../../admin-auth";
import { publicProjectId } from "../../../project-context";

const PUBLIC_KINDS = new Set(["masterplan"]);
const ADMIN_KINDS = new Set(["sourcePdf"]);
const SUPER_ADMIN_ONLY = new Set([
  "sourceCad",
  "cadGeometry",
  "plotSheet",
  "masterplanOriginal",
]);

async function authorizedProjectId(request: Request) {
  const session = await getAdminSession();
  const url = new URL(request.url);
  const requested = url.searchParams.get("projectId");
  const preview = url.searchParams.get("preview") === "1";

  if (session?.role === "super_admin" && requested && preview) {
    const row = await env.DB.prepare(
      "SELECT id FROM projects WHERE id=? AND status='active' LIMIT 1",
    )
      .bind(requested)
      .first<{ id: string }>();
    return row?.id || null;
  }
  if (
    session?.role === "client_admin" &&
    requested &&
    preview &&
    requested === session.projectId
  )
    return session.projectId;
  if (session?.projectId) return session.projectId;
  return publicProjectId(request);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind } = await params;
  if (![...PUBLIC_KINDS, ...ADMIN_KINDS, ...SUPER_ADMIN_ONLY].includes(kind))
    return new Response("Not found", { status: 404 });

  const session = await getAdminSession();
  if (SUPER_ADMIN_ONLY.has(kind) && session?.role !== "super_admin")
    return new Response("Not found", { status: 404 });
  if (ADMIN_KINDS.has(kind) && !session)
    return new Response("Not found", { status: 404 });

  const projectId = await authorizedProjectId(request);
  if (!projectId) return new Response("Not found", { status: 404 });

  // The mapping masterplan is the canonical visual source of truth.
  // Do NOT silently swap generic/public clients to an independently generated
  // derivative here: a stale/rotated derivative can make the visible image move
  // away from the already-saved normalized SVG polygons. Correctness wins over
  // bandwidth. masterplanPublic remains a disaster-recovery fallback only.
  const canonicalKind = kind === "masterplan" ? "masterplan" : kind;
  let object = await env.BUCKET.get(`projects/${projectId}/mapper/${canonicalKind}`);
  let servedMasterplanSource = kind === "masterplan" ? "canonical" : canonicalKind;

  if (!object && kind === "masterplan") {
    object = await env.BUCKET.get(`projects/${projectId}/mapper/masterplanPublic`);
    servedMasterplanSource = "public-fallback";
  }
  if (!object) return new Response("Not found", { status: 404 });

  const previewRequest = new URL(request.url).searchParams.get("preview") === "1";
  const headers = new Headers({
    "content-type": object.httpMetadata?.contentType || "application/octet-stream",
    "cache-control":
      session || previewRequest
        ? "no-store"
        : kind === "masterplan"
          ? "public,max-age=0,must-revalidate"
          : "private,no-store",
    "x-content-type-options": "nosniff",
  });
  if (kind === "masterplan") {
    headers.set("x-rekixo-masterplan-source", servedMasterplanSource);
  }
  if (kind === "sourceCad" || kind === "plotSheet" || kind === "masterplanOriginal")
    headers.set("content-disposition", "attachment");
  if (object.httpEtag) headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
}
