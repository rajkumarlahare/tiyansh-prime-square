import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import AdminDashboard from "../../../admin-dashboard";
import { getAdminSession, panelMode } from "../../../admin-auth";
import { isPlatformAccessHost, projectBySlug } from "../../../project-context";

export const dynamic = "force-dynamic";

export default async function ProjectAdminPage({ params }: { params: Promise<{ slug: string }> }) {
  if (panelMode() === "super") notFound();
  const { slug } = await params;
  const host = (await headers()).get("host") || "";
  if (!isPlatformAccessHost(host)) notFound();
  const project = await projectBySlug(slug, true);
  if (!project) notFound();
  const base = `/projects/${encodeURIComponent(project.slug)}`;
  const session = await getAdminSession();
  if (!session || session.role !== "client_admin" || session.projectId !== project.id) {
    redirect(`${base}/admin-login`);
  }
  if (session.mustChangePassword) redirect(`${base}/change-password`);
  return (
    <AdminDashboard
      user={{ name: session.name, email: session.email, role: "client_admin" }}
      signOut={`/api/admin/logout?returnTo=${encodeURIComponent(`${base}/admin-login`)}`}
      projectId={project.id}
      publicSiteHref={base}
    />
  );
}
