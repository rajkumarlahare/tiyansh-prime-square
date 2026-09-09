import type { Metadata } from "next";
import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { panelMode } from "../../admin-auth";
import { isPlatformAccessHost, projectBySlug } from "../../project-context";

export const dynamic = "force-dynamic";

type MetaSettings = Record<string, string>;

async function readProjectMeta(slug: string) {
  const project = await projectBySlug(slug);
  if (!project) return null;

  const rows = await env.DB.prepare(
    "SELECT key,value FROM settings WHERE project_id=? AND key IN ('projectName','brandName','location','address','logoName','logoVersion','shareTitle','shareDescription','shareImage')",
  )
    .bind(project.id)
    .all<{ key: string; value: string }>();

  const settings: MetaSettings = Object.fromEntries(
    (rows.results || []).map((row) => [row.key, row.value]),
  );

  const title =
    settings.shareTitle || settings.projectName || project.name || "Project";
  const description =
    settings.shareDescription ||
    [settings.brandName, settings.address || settings.location]
      .filter(Boolean)
      .join(" • ") ||
    `${title} interactive plot visualization.`;

  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "";
  const proto = requestHeaders.get("x-forwarded-proto") || "https";
  const origin = host ? `${proto}://${host}` : "";

  const logoPath = settings.logoName
    ? `/api/project-asset/logo?projectId=${encodeURIComponent(project.id)}&v=${encodeURIComponent(settings.logoVersion || settings.logoName)}`
    : "";
  const imagePath = settings.shareImage || logoPath;
  const imageUrl =
    imagePath && origin ? new URL(imagePath, origin).toString() : imagePath || "";
  const logoUrl =
    logoPath && origin ? new URL(logoPath, origin).toString() : logoPath || "";

  return {
    project,
    title,
    description,
    imageUrl,
    logoUrl,
    hasShareImage: Boolean(settings.shareImage),
    brandName: settings.brandName || "AR 3D Vision",
    origin,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = await readProjectMeta(slug);

  if (!meta) {
    return {
      title: "Project",
      description: "Interactive project and plot visualization.",
    };
  }

  const images = meta.imageUrl
    ? [{ url: meta.imageUrl, alt: meta.title }]
    : undefined;

  return {
    metadataBase: meta.origin ? new URL(meta.origin) : undefined,
    title: meta.title,
    description: meta.description,
    icons: meta.logoUrl
      ? { icon: meta.logoUrl, shortcut: meta.logoUrl }
      : undefined,
    openGraph: {
      type: "website",
      siteName: meta.brandName,
      title: meta.title,
      description: meta.description,
      images,
    },
    twitter: {
      card: meta.hasShareImage ? "summary_large_image" : "summary",
      title: meta.title,
      description: meta.description,
      images: meta.imageUrl ? [meta.imageUrl] : undefined,
    },
  };
}

export default async function SharedProjectPage({
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
        src={`/__rekixo/project/index.html?projectSlug=${encodeURIComponent(project.slug)}`}
        loading="eager"
        style={{ width: "100%", height: "100%", border: 0, display: "block" }}
      />
    </main>
  );
}
