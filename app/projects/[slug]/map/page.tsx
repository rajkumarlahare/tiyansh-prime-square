import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { panelMode } from "../../../admin-auth";
import { isPlatformAccessHost, projectBySlug } from "../../../project-context";
import GeoPublicMap from "./geo-public-map";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = await projectBySlug(slug);
  if (!project) return { title: "Satellite Map" };
  return {
    title: `${project.name} · Satellite Map`,
    description: `${project.name} satellite masterplan and live plot availability.`,
  };
}

export default async function PublicGeoMapPage({
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

  return <GeoPublicMap projectName={project.name} projectSlug={project.slug} />;
}
