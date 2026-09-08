import {
  clientFallbackHost,
  clientPlatformHost,
  sharedAdminHost as configuredSharedAdminHost,
} from "./project-context";

export type ProjectLinkSet = {
  projectPath: string;
  platformUrl: string;
  platformAdminUrl: string;
  fallbackUrl: string;
  fallbackAdminUrl: string;
  customPublicUrl: string;
  customAdminUrl: string;
  publicUrl: string;
  adminUrl: string;
};

type ProjectLinkOptions = {
  slug: string;
  platformHost?: string | null;
  sharedAdminHost?: string | null;
  fallbackHost?: string | null;
  publicHost?: string | null;
  adminHost?: string | null;
};

function absoluteUrl(host: string | null | undefined, path = "") {
  return host ? `https://${host}${path}` : "";
}

export function buildProjectLinks({
  slug,
  platformHost,
  sharedAdminHost,
  fallbackHost,
  publicHost,
  adminHost,
}: ProjectLinkOptions): ProjectLinkSet {
  const projectPath = `/projects/${encodeURIComponent(slug)}`;
  const platformUrl = absoluteUrl(platformHost, projectPath);
  const canonicalAdminHost = platformHost || sharedAdminHost;
  const platformAdminUrl = absoluteUrl(
    canonicalAdminHost,
    `${projectPath}/admin-login`,
  );
  const fallbackUrl = absoluteUrl(fallbackHost, projectPath);
  const fallbackAdminUrl = absoluteUrl(
    fallbackHost,
    `${projectPath}/admin-login`,
  );
  const customPublicUrl = absoluteUrl(publicHost);
  const customAdminUrl = absoluteUrl(adminHost, "/admin/login");

  return {
    projectPath,
    platformUrl,
    platformAdminUrl,
    fallbackUrl,
    fallbackAdminUrl,
    customPublicUrl,
    customAdminUrl,
    // Boss/shared platform path is canonical whenever configured.
    // Custom domains remain supported aliases, then workers.dev is the safe fallback.
    publicUrl: platformUrl || customPublicUrl || fallbackUrl,
    adminUrl: platformAdminUrl || customAdminUrl || fallbackAdminUrl,
  };
}

export function currentProjectLinks(
  slug: string,
  publicHost?: string | null,
  adminHost?: string | null,
) {
  return buildProjectLinks({
    slug,
    platformHost: clientPlatformHost(),
    sharedAdminHost: configuredSharedAdminHost(),
    fallbackHost: clientFallbackHost(),
    publicHost,
    adminHost,
  });
}
