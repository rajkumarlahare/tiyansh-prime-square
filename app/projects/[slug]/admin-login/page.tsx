import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getAdminSession, panelMode } from "../../../admin-auth";
import LoginForm from "../../../admin/login/login-form";
import { isPlatformAccessHost, projectBySlug } from "../../../project-context";

export const dynamic = "force-dynamic";

function loginError(code:string|undefined){
  if(code==="invalid")return "Email ya password galat hai.";
  if(code==="rate")return "Too many attempts. 15 minutes baad try karein.";
  if(code==="origin")return "Login request reject hua. Page reload karke dobara try karein.";
  return "";
}

export default async function ProjectAdminLoginPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{loginError?:string}> }) {
  if (panelMode() === "super") notFound();
  const { slug } = await params;
  const host = (await headers()).get("host") || "";
  if (!isPlatformAccessHost(host)) notFound();
  const project = await projectBySlug(slug, true);
  if (!project) notFound();
  const session = await getAdminSession();
  if (session?.role === "client_admin" && session.projectId === project.id) {
    redirect(`/projects/${encodeURIComponent(project.slug)}/admin`);
  }
  const base = `/projects/${encodeURIComponent(project.slug)}`;
  const query=await searchParams;
  return (
    <LoginForm
      mode="client"
      projectId={project.id}
      projectSlug={project.slug}
      projectName={project.name}
      successPath={`${base}/admin`}
      changePasswordPath={`${base}/change-password`}
      backPath={base}
      initialError={loginError(query.loginError)}
    />
  );
}
