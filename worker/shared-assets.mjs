export const SHARED_ASSET_PREFIX = "/__rekixo";

export function isSharedAssetPath(pathname) {
  return pathname === SHARED_ASSET_PREFIX || pathname.startsWith(`${SHARED_ASSET_PREFIX}/`);
}

export function stripSharedAssetPath(pathname) {
  if (!isSharedAssetPath(pathname)) return pathname;
  return pathname.slice(SHARED_ASSET_PREFIX.length) || "/";
}

export function isPrefixedFrameworkAssetPath(pathname) {
  if (!isSharedAssetPath(pathname)) return false;
  const stripped = stripSharedAssetPath(pathname);
  return stripped.startsWith("/assets/") || stripped.startsWith("/_next/") || stripped.startsWith("/_vinext/");
}

export function rewriteAssetReferences(text) {
  return String(text).replace(
    /(^|[ "'(=<])\/(assets|_next|_vinext)\//gm,
    (_match, prefix, root) => `${prefix}${SHARED_ASSET_PREFIX}/${root}/`,
  );
}

export function shouldRewriteAssetBody(contentType) {
  const type = String(contentType || "").toLowerCase();
  return type.includes("text/html") || type.includes("text/css") || type.includes("javascript") || type.includes("text/x-component") || type.includes("application/json");
}
