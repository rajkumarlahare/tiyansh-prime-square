import { env } from "cloudflare:workers";
import { notFound, redirect } from "next/navigation";
import { validAdminSession } from "../../admin-auth";

export const dynamic = "force-dynamic";

export default async function ProjectPreview({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await validAdminSession();
  if (!session) redirect("/admin/login");

  const { projectId } = await params;
  if (session.role !== "super_admin" && session.projectId !== projectId) notFound();

  const project = await env.DB.prepare(
    "SELECT id,name FROM projects WHERE id=? AND status='active' LIMIT 1",
  )
    .bind(projectId)
    .first<{ id: string; name: string }>();

  // Old preview tabs may contain a short legacy identifier such as /preview/904.
  // Super Admin may resolve it only when it matches exactly ONE active project,
  // then immediately redirect to the canonical project UUID. Client admins stay
  // exact-tenant scoped and never receive prefix lookup behavior.
  if (
    !project &&
    session.role === "super_admin" &&
    /^[A-Za-z0-9-]{3,35}$/.test(projectId)
  ) {
    const prefix = await env.DB.prepare(
      "SELECT id,name FROM projects WHERE id LIKE ? AND status='active' ORDER BY id LIMIT 2",
    )
      .bind(`${projectId}%`)
      .all<{ id: string; name: string }>();
    const matches = prefix.results || [];
    if (matches.length === 1) {
      redirect(`/preview/${encodeURIComponent(matches[0].id)}`);
    }
  }

  if (!project) notFound();

  return (
    <main style={{ position: "fixed", inset: 0, background: "#050914" }}>
      <iframe
        title={`${project.name} preview`}
        src={`/project/index.html?projectId=${encodeURIComponent(project.id)}&preview=1`}
        loading="eager"
        style={{ width: "100%", height: "100%", border: 0, display: "block" }}
      />
    </main>
  );
}
