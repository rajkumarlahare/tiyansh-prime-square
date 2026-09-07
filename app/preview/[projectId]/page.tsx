import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProjectPreview({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await env.DB.prepare(
    "SELECT id,name FROM projects WHERE id=? AND status='active' LIMIT 1",
  )
    .bind(projectId)
    .first<{ id: string; name: string }>();
  if (!project) notFound();

  return (
    <main style={{ position: "fixed", inset: 0, background: "#050914" }}>
      <iframe
        title={`${project.name} preview`}
        src={`/project/index.html?projectId=${encodeURIComponent(project.id)}`}
        loading="eager"
        style={{ width: "100%", height: "100%", border: 0, display: "block" }}
      />
    </main>
  );
}
