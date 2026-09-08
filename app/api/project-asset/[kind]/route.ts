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

async function activeProjectId(projectId: string) {
  if (!projectId) return null;
  const row = await env.DB.prepare(
    "SELECT id FROM projects WHERE id=? AND status='active' LIMIT 1",
  )
    .bind(projectId)
    .first<{ id: string }>();
  return row?.id || null;
}

async function authorizedProjectId(request: Request) {
  const session = await getAdminSession();
  const requested = new URL(request.url).searchParams.get("projectId");

  // Super Admin works across many tenants. The selected project must always
  // win over the legacy Tiyansh session fallback.
  if (session?.role === "super_admin") {
    return activeProjectId(requested || session.projectId);
  }

  // Client admins remain hard tenant-scoped.
  if (session?.role === "client_admin") {
    if (requested && requested !== session.projectId) return null;
    return activeProjectId(session.projectId);
  }

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
  headers.set("x-rekixo-project", projectId);
  if (kind === "masterplan") {
    headers.set("x-rekixo-masterplan-source", servedMasterplanSource);
  }
  if (kind === "sourceCad" || kind === "plotSheet" || kind === "masterplanOriginal")
    headers.set("content-disposition", "attachment");
  if (object.httpEtag) headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
}
