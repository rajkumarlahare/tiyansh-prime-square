import { env } from "cloudflare:workers";
import { requireSuperAdmin, sameOrigin } from "../../../admin-auth";
import { writeAudit } from "../../../audit";
import {
  cleanHostInput,
  domainSupports,
  normalizeSlug,
  validHostname,
  validSlug,
  type DomainKind,
} from "../../../domain-utils";
import {
  assertDomainAvailable,
  deleteProjectDomain,
  upsertPrimaryProjectDomain,
} from "../../../project-domains";
import {
  clientFallbackHost,
  clientPlatformHost,
  sharedAdminHost,
} from "../../../project-context";
import { currentProjectLinks } from "../../../project-links";

const denied = () => Response.json({ error: "Super Admin access required" }, { status: 403 });

type DomainRow = {
  host: string;
  projectId: string;
  kind: DomainKind;
  publicPrimary: number;
  adminPrimary: number;
  status: string;
};

function links(slug: string, publicHost?: string | null, adminHost?: string | null) {
  return currentProjectLinks(slug, publicHost, adminHost);
}

export async function GET() {
  const actor = await requireSuperAdmin();
  if (!actor) return denied();

  const [projectsResult, domainsResult] = await Promise.all([
    env.DB.prepare(
      "SELECT id,name,slug,status,public_status AS publicStatus,publish_version AS publishVersion,public_host AS publicHost,admin_host AS adminHost,created_at AS createdAt,updated_at AS updatedAt FROM projects WHERE status!='deleted' ORDER BY created_at DESC",
    ).all<{
      id: string;
      name: string;
      slug: string;
      status: string;
      publicStatus: string;
      publishVersion: number;
      publicHost: string | null;
      adminHost: string | null;
      createdAt: string;
      updatedAt: string;
    }>(),
    env.DB.prepare(
      "SELECT host,project_id AS projectId,kind,public_primary AS publicPrimary,admin_primary AS adminPrimary,status FROM project_domains ORDER BY created_at ASC",
    ).all<DomainRow>(),
  ]);

  const domains = domainsResult.results;
  const projects = projectsResult.results.map((project) => {
    const rows = domains.filter((item) => item.projectId === project.id);
    const knownHosts = new Set(rows.map((row) => row.host));
    if (project.publicHost && !knownHosts.has(project.publicHost)) {
      rows.push({
        host: project.publicHost,
        projectId: project.id,
        kind: "public",
        publicPrimary: 1,
        adminPrimary: 0,
        status: "active",
      });
      knownHosts.add(project.publicHost);
    }
    if (project.adminHost && !knownHosts.has(project.adminHost)) {
      rows.push({
        host: project.adminHost,
        projectId: project.id,
        kind: "admin",
        publicPrimary: 0,
        adminPrimary: 1,
        status: "active",
      });
    }
    const primaryPublic =
      rows.find(
        (row) =>
          row.status === "active" &&
          row.publicPrimary &&
          domainSupports(row.kind, "public"),
      )?.host || project.publicHost;
    const primaryAdmin =
      rows.find(
        (row) =>
          row.status === "active" &&
          row.adminPrimary &&
          domainSupports(row.kind, "admin"),
      )?.host || project.adminHost;
    return {
      ...project,
      domains: rows,
      ...links(project.slug, primaryPublic, primaryAdmin),
    };
  });

  return Response.json(
    {
      projects,
      platformHost: clientPlatformHost() || null,
      fallbackHost: clientFallbackHost() || null,
      sharedAdminHost: sharedAdminHost() || null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return denied();
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid request origin" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    host?: string;
    kind?: "public" | "admin";
    primary?: boolean;
  };
  const projectId = String(body.projectId || "").trim();
  const kind = body.kind === "admin" ? "admin" : "public";
  const host = cleanHostInput(body.host);
  if (!projectId || !host || !validHostname(host))
    return Response.json({ error: "Valid project aur hostname required" }, { status: 400 });

  const project = await env.DB.prepare(
    "SELECT id FROM projects WHERE id=? AND status!='deleted' LIMIT 1",
  )
    .bind(projectId)
    .first<{ id: string }>();
  if (!project) return Response.json({ error: "Project nahi mila" }, { status: 404 });

  try {
    await assertDomainAvailable(host, projectId);
    const now = new Date().toISOString();
    const existing = await env.DB.prepare(
      "SELECT kind FROM project_domains WHERE host=? AND project_id=? LIMIT 1",
    )
      .bind(host, projectId)
      .first<{ kind: DomainKind }>();

    if (body.primary !== false) {
      await upsertPrimaryProjectDomain(projectId, kind, host, now);
    } else if (existing) {
      const nextKind =
        existing.kind === "both" || existing.kind === kind ? existing.kind : "both";
      await env.DB.prepare(
        "UPDATE project_domains SET kind=?,status='active',updated_at=? WHERE host=? AND project_id=?",
      )
        .bind(nextKind, now, host, projectId)
        .run();
    } else {
      await env.DB.prepare(
        "INSERT INTO project_domains (host,project_id,kind,public_primary,admin_primary,status,created_at,updated_at) VALUES (?,?,?,?,?,'active',?,?)",
      )
        .bind(host, projectId, kind, 0, 0, now, now)
        .run();
    }

    await writeAudit(actor, "project.domain_added", projectId, host, {
      kind,
      primary: body.primary !== false,
    });
    return Response.json({ ok: true, host, kind });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Domain save nahi hua" },
      { status: 409 },
    );
  }
}

export async function PATCH(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return denied();
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid request origin" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    host?: string;
    kind?: "public" | "admin";
    action?: "set_primary" | "slug";
    slug?: string;
  };
  const projectId = String(body.projectId || "").trim();
  if (!projectId) return Response.json({ error: "Project required" }, { status: 400 });

  if (body.action === "slug") {
    const slug = normalizeSlug(body.slug);
    if (!validSlug(slug))
      return Response.json({ error: "Valid public link slug required" }, { status: 400 });
    try {
      await env.DB.prepare("UPDATE projects SET slug=?,updated_at=? WHERE id=?")
        .bind(slug, new Date().toISOString(), projectId)
        .run();
      await writeAudit(actor, "project.slug_updated", projectId, slug, { slug });
      return Response.json({ ok: true, slug });
    } catch {
      return Response.json({ error: "Ye slug pehle se use ho raha hai" }, { status: 409 });
    }
  }

  if (body.action === "set_primary") {
    const kind = body.kind === "admin" ? "admin" : "public";
    const host = cleanHostInput(body.host);
    if (!host) return Response.json({ error: "Hostname required" }, { status: 400 });
    try {
      await upsertPrimaryProjectDomain(projectId, kind, host);
      await writeAudit(actor, "project.domain_primary", projectId, host, { kind });
      return Response.json({ ok: true, host, kind });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Primary domain update nahi hua" },
        { status: 409 },
      );
    }
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}

export async function DELETE(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return denied();
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid request origin" }, { status: 403 });

  const url = new URL(request.url);
  const projectId = String(url.searchParams.get("projectId") || "");
  const host = cleanHostInput(url.searchParams.get("host"));
  if (!projectId || !host)
    return Response.json({ error: "Project aur hostname required" }, { status: 400 });

  try {
    await deleteProjectDomain(projectId, host);
    await writeAudit(actor, "project.domain_removed", projectId, host);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Domain remove nahi hua" },
      { status: 404 },
    );
  }
}
