import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { panelMode } from "../../admin-auth";
import {
  isPlatformAccessHost,
  projectBySlug,
} from "../../project-context";

export const dynamic = "force-dynamic";

export default async function PlatformProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (panelMode() === "super") notFound();
  const { slug } = await params;
  const host = (await headers()).get("host") || "";
  if (!isPlatformAccessHost(host)) notFound();
  const project = await projectBySlug(slug);
  if (!project) notFound();

  return (
    <main style={{ position: "fixed", inset: 0, background: "#050914" }}>
      <iframe
        title={`${project.name} website`}
        src={`/project/index.html?projectSlug=${encodeURIComponent(project.slug)}`}
        loading="eager"
        style={{ width: "100%", height: "100%", border: 0, display: "block" }}
      />
    </main>
  );
}
