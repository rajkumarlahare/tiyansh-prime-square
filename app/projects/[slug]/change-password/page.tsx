import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getAdminSession, panelMode } from "../../../admin-auth";
import ChangePasswordForm from "../../../admin/change-password/password-form";
import { isPlatformAccessHost, projectBySlug } from "../../../project-context";

export const dynamic = "force-dynamic";

export default async function ProjectChangePasswordPage({ params }: { params: Promise<{ slug: string }> }) {
  if (panelMode() === "super") notFound();
  const { slug } = await params;
  const host = (await headers()).get("host") || "";
  if (!isPlatformAccessHost(host)) notFound();
  const project = await projectBySlug(slug, true);
  if (!project) notFound();
  const base = `/projects/${encodeURIComponent(project.slug)}`;
  const session = await getAdminSession();
  if (!session || session.role !== "client_admin" || session.projectId !== project.id) redirect(`${base}/admin-login`);
  if (!session.mustChangePassword) redirect(`${base}/admin`);
  return <ChangePasswordForm email={session.email} projectName={project.name} successPath={`${base}/admin`} />;
}
