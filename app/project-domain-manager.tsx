"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink, Globe2, Link2, Pencil, Plus, Trash2 } from "lucide-react";

type Domain = {
  host: string;
  projectId: string;
  kind: "public" | "admin" | "both";
  publicPrimary: number;
  adminPrimary: number;
  status: string;
};

type Project = {
  id: string;
  name: string;
  slug: string;
  publicStatus: string;
  publishVersion: number;
  domains: Domain[];
  publicUrl: string;
  platformUrl: string;
  fallbackUrl: string;
  adminUrl: string;
};

export default function ProjectDomainManager({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [busy, setBusy] = useState("");

  async function load() {
    const response = await fetch("/api/admin/domains", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Domains load nahi hue");
    setProjects(data.projects || []);
  }

  useEffect(() => {
    load().catch((error) =>
      notify(error instanceof Error ? error.message : "Domains load nahi hue"),
    );
  }, [notify]);

  async function mutate(
    label: string,
    request: () => Promise<Response>,
  ) {
    setBusy(label);
    try {
      const response = await request();
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Domain update nahi hua");
      await load();
      notify("Project domain mapping update ho gayi");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Domain update nahi hua");
    } finally {
      setBusy("");
    }
  }

  function add(project: Project, kind: "public" | "admin") {
    const host = prompt(
      kind === "public"
        ? "Public website hostname — example: rpk.example.com"
        : "Client admin hostname — example: admin.rpk.example.com",
      "",
    );
    if (!host) return;
    mutate(`${project.id}-${kind}`, () =>
      fetch("/api/admin/domains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: project.id, host, kind, primary: true }),
      }),
    );
  }

  function alias(project: Project) {
    const host = prompt("Additional public alias hostname", "");
    if (!host) return;
    mutate(`${project.id}-alias`, () =>
      fetch("/api/admin/domains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          host,
          kind: "public",
          primary: false,
        }),
      }),
    );
  }

  function editSlug(project: Project) {
    const slug = prompt("Platform link slug", project.slug);
    if (!slug || slug === project.slug) return;
    mutate(`${project.id}-slug`, () =>
      fetch("/api/admin/domains", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          action: "slug",
          slug,
        }),
      }),
    );
  }

  function setPrimary(project: Project, domain: Domain, kind: "public" | "admin") {
    mutate(`${project.id}-${domain.host}-primary`, () =>
      fetch("/api/admin/domains", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          host: domain.host,
          kind,
          action: "set_primary",
        }),
      }),
    );
  }

  function remove(project: Project, domain: Domain) {
    if (!confirm(`${domain.host} ko project se remove karein?`)) return;
    mutate(`${project.id}-${domain.host}-delete`, () =>
      fetch(
        `/api/admin/domains?projectId=${encodeURIComponent(project.id)}&host=${encodeURIComponent(domain.host)}`,
        { method: "DELETE" },
      ),
    );
  }

  async function copy(value: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    notify("Link copy ho gaya");
  }

  return (
    <section className="card rekixo-domain-manager">
      <div className="client-list-head">
        <div>
          <h2>Project links & domains</h2>
          <p>
            New clients ke liye naya Worker nahi. Ek generic Rekixo Client Sites
            Worker hostname se project resolve karega.
          </p>
        </div>
        <b>{projects.length}</b>
      </div>

      <div className="rekixo-domain-projects">
        {projects.map((project) => (
          <article key={project.id} className="rekixo-domain-project">
            <header>
              <div>
                <b>{project.name}</b>
                <small>
                  {project.publicStatus} · v{project.publishVersion || 0}
                </small>
              </div>
              <button onClick={() => editSlug(project)}>
                <Pencil /> Link slug
              </button>
            </header>

            <div className="rekixo-domain-link">
              <span>Guaranteed fallback</span>
              <code>{project.fallbackUrl || "—"}</code>
              <button onClick={() => copy(project.fallbackUrl)} disabled={!project.fallbackUrl}>
                <Copy />
              </button>
              {project.fallbackUrl && (
                <a href={project.fallbackUrl} target="_blank" rel="noreferrer">
                  <ExternalLink />
                </a>
              )}
            </div>

            <div className="rekixo-domain-link">
              <span>Platform link</span>
              <code>{project.platformUrl || "Cloudflare setup pending"}</code>
              <button onClick={() => copy(project.platformUrl)} disabled={!project.platformUrl}>
                <Copy />
              </button>
              {project.platformUrl && (
                <a href={project.platformUrl} target="_blank" rel="noreferrer">
                  <ExternalLink />
                </a>
              )}
            </div>

            <div className="rekixo-domain-actions">
              <button onClick={() => add(project, "public")} disabled={Boolean(busy)}>
                <Globe2 /> Public domain
              </button>
              <button onClick={() => alias(project)} disabled={Boolean(busy)}>
                <Plus /> Public alias
              </button>
              <button onClick={() => add(project, "admin")} disabled={Boolean(busy)}>
                <Link2 /> Admin domain
              </button>
            </div>

            <div className="rekixo-domain-rows">
              {project.domains.length ? (
                project.domains.map((domain) => (
                  <div key={domain.host}>
                    <span>
                      <b>{domain.host}</b>
                      <small>
                        {domain.kind}
                        {domain.publicPrimary ? " · public primary" : ""}
                        {domain.adminPrimary ? " · admin primary" : ""}
                      </small>
                    </span>
                    {(domain.kind === "public" || domain.kind === "both") &&
                      !domain.publicPrimary && (
                        <button onClick={() => setPrimary(project, domain, "public")}>
                          Public primary
                        </button>
                      )}
                    {(domain.kind === "admin" || domain.kind === "both") &&
                      !domain.adminPrimary && (
                        <button onClick={() => setPrimary(project, domain, "admin")}>
                          Admin primary
                        </button>
                      )}
                    <a href={`https://${domain.host}`} target="_blank" rel="noreferrer">
                      <ExternalLink />
                    </a>
                    <button className="danger" onClick={() => remove(project, domain)}>
                      <Trash2 />
                    </button>
                  </div>
                ))
              ) : (
                <p className="empty">
                  Custom domain pending — fallback/platform link se project preview/share
                  kiya ja sakta hai.
                </p>
              )}
            </div>
          </article>
        ))}
      </div>

      <p className="rekixo-domain-note">
        Domain yahan save karna app routing set karta hai. Cloudflare me DNS/Custom
        Domain/Custom Hostname attachment ek separate infrastructure step hai.
      </p>
    </section>
  );
}
