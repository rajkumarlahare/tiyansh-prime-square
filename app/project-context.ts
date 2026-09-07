import { env } from "cloudflare:workers";
import {
  normalizeHost,
  platformSlugFromHost,
  type DomainKind,
} from "./domain-utils";

export const DEFAULT_PROJECT_ID = "tiyansh-prime-square";

const cfg = () => env as unknown as Record<string, string>;

export function requestHost(request: Request) {
  try {
    return normalizeHost(new URL(request.url).hostname);
  } catch {
    return normalizeHost(request.headers.get("host"));
  }
}

export function clientFallbackHost() {
  return normalizeHost(
    cfg().CLIENT_FALLBACK_HOST || "rekixo-client-sites.ai-8f3.workers.dev",
  );
}

export function legacyFallbackHost() {
  return normalizeHost(
    cfg().LEGACY_FALLBACK_HOST || "tiyansh-prime-square.ai-8f3.workers.dev",
  );
}

export function clientPlatformHost() {
  return normalizeHost(cfg().CLIENT_PLATFORM_HOST || "sites.rekixo.com");
}

export function sharedAdminHost() {
  return normalizeHost(cfg().CLIENT_SHARED_ADMIN_HOST || "");
}

export function isPlatformAccessHost(hostValue: string) {
  const host = normalizeHost(hostValue);
  return (
    host === clientFallbackHost() ||
    host === legacyFallbackHost() ||
    host === clientPlatformHost()
  );
}

type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  publicStatus: string;
  status: string;
  publicHost: string | null;
  adminHost: string | null;
};

type DomainRow = {
  projectId: string;
  kind: DomainKind;
  publicStatus: string;
  projectStatus: string;
  slug: string;
};

async function projectById(id: string, includeDraft = false) {
  const row = await env.DB.prepare(
    "SELECT id,name,slug,public_status AS publicStatus,status,public_host AS publicHost,admin_host AS adminHost FROM projects WHERE id=? AND status='active' LIMIT 1",
  )
    .bind(id)
    .first<ProjectRow>();
  if (!row || (!includeDraft && row.publicStatus !== "published")) return null;
  return row;
}

export async function projectBySlug(slug: string, includeDraft = false) {
  const row = await env.DB.prepare(
    "SELECT id,name,slug,public_status AS publicStatus,status,public_host AS publicHost,admin_host AS adminHost FROM projects WHERE slug=? AND status='active' LIMIT 1",
  )
    .bind(slug)
    .first<ProjectRow>();
  if (!row || (!includeDraft && row.publicStatus !== "published")) return null;
  return row;
}

async function exactDomain(host: string) {
  return env.DB.prepare(
    "SELECT d.project_id AS projectId,d.kind,p.public_status AS publicStatus,p.status AS projectStatus,p.slug FROM project_domains d JOIN projects p ON p.id=d.project_id WHERE d.host=? AND d.status='active' AND p.status='active' LIMIT 1",
  )
    .bind(host)
    .first<DomainRow>();
}

async function legacyProjectForHost(host: string) {
  return env.DB.prepare(
    "SELECT id,name,slug,public_status AS publicStatus,status,public_host AS publicHost,admin_host AS adminHost FROM projects WHERE status='active' AND (public_host=? OR admin_host=?) LIMIT 1",
  )
    .bind(host, host)
    .first<ProjectRow>();
}

export async function publicProjectId(request: Request): Promise<string | null> {
  const host = requestHost(request);

  const domain = await exactDomain(host);
  if (
    domain &&
    (domain.kind === "public" || domain.kind === "both") &&
    domain.publicStatus === "published"
  )
    return domain.projectId;

  const legacy = await legacyProjectForHost(host);
  if (
    legacy &&
    legacy.publicHost === host &&
    legacy.publicStatus === "published"
  )
    return legacy.id;

  const slugFromHost = platformSlugFromHost(host, clientPlatformHost());
  if (slugFromHost) {
    const project = await projectBySlug(slugFromHost);
    if (project) return project.id;
  }

  if (isPlatformAccessHost(host)) {
    const url = new URL(request.url);
    const requestedId = url.searchParams.get("projectId");
    const requestedSlug = url.searchParams.get("projectSlug");
    if (requestedId) {
      const project = await projectById(requestedId);
      if (project) return project.id;
    }
    if (requestedSlug) {
      const project = await projectBySlug(requestedSlug);
      if (project) return project.id;
    }
  }

  if (host === legacyFallbackHost()) {
    const project = await projectById(DEFAULT_PROJECT_ID);
    if (project) return project.id;
  }

  return null;
}

export async function projectHostRole(hostValue: string) {
  const host = normalizeHost(hostValue);
  if (!host) return null;

  if (sharedAdminHost() && host === sharedAdminHost())
    return { projectId: null, role: "admin_shared" as const };

  const domain = await exactDomain(host);
  if (domain) {
    if (domain.kind === "admin")
      return { projectId: domain.projectId, role: "admin" as const };
    if (domain.kind === "both") {
      if (domain.publicStatus === "published")
        return { projectId: domain.projectId, role: "public" as const };
      return { projectId: domain.projectId, role: "admin" as const };
    }
    if (domain.publicStatus === "published")
      return { projectId: domain.projectId, role: "public" as const };
    return { projectId: domain.projectId, role: "unpublished" as const };
  }

  const legacy = await legacyProjectForHost(host);
  if (legacy) {
    if (legacy.publicHost === host && legacy.publicStatus === "published")
      return { projectId: legacy.id, role: "public" as const };
    if (legacy.adminHost === host)
      return { projectId: legacy.id, role: "admin" as const };
    if (legacy.publicHost === host)
      return { projectId: legacy.id, role: "unpublished" as const };
  }

  const slug = platformSlugFromHost(host, clientPlatformHost());
  if (slug) {
    const project = await projectBySlug(slug, true);
    if (!project) return null;
    return {
      projectId: project.id,
      role: project.publicStatus === "published" ? ("public" as const) : ("unpublished" as const),
    };
  }

  if (host === legacyFallbackHost())
    return { projectId: DEFAULT_PROJECT_ID, role: "public" as const };

  return null;
}
