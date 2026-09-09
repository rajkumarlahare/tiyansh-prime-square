/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
  isPrefixedFrameworkAssetPath,
  isSharedAssetPath,
  rewriteAssetReferences,
  shouldRewriteAssetBody,
  stripSharedAssetPath,
} from "./shared-assets.mjs";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  CLIENT_PLATFORM_HOST?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function normalizedHost(value: string | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
}

function isSharedPlatformRequest(url: URL, env: Env) {
  const configured = normalizedHost(env.CLIENT_PLATFORM_HOST);
  return Boolean(configured && normalizedHost(url.hostname) === configured);
}

function stripSharedAssetPrefix(request: Request) {
  const url = new URL(request.url);
  const strippedPath = stripSharedAssetPath(url.pathname);
  if (strippedPath === url.pathname) return request;
  url.pathname = strippedPath;
  return new Request(url.toString(), request);
}

async function rewriteSharedAssets(response: Response) {
  const headers = new Headers(response.headers);
  let headerChanged = false;

  // React/Vinext can advertise CSS/JS through HTTP Link preload headers.
  const link = headers.get("link");
  if (link) {
    const rewrittenLink = rewriteAssetReferences(link);
    if (rewrittenLink !== link) {
      headers.set("link", rewrittenLink);
      headerChanged = true;
    }
  }

  const contentType = response.headers.get("content-type") || "";
  if (!response.body || !shouldRewriteAssetBody(contentType)) {
    if (!headerChanged) return response;
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  const body = rewriteAssetReferences(await response.text());
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function frameworkAssetUsable(response: Response, pathname: string) {
  if (response.status === 404) return false;
  const type = (response.headers.get("content-type") || "").toLowerCase();
  const lower = pathname.toLowerCase();
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return type.includes("javascript");
  if (lower.endsWith(".css")) return type.includes("text/css");
  // Never let an HTML app fallback masquerade as a framework asset.
  return !type.includes("text/html");
}

async function fetchAssetCandidate(request: Request, env: Env) {
  try {
    return await env.ASSETS.fetch(request);
  } catch {
    return null;
  }
}

async function fetchPrefixedFrameworkAsset(request: Request, env: Env) {
  const url = new URL(request.url);
  if (!isPrefixedFrameworkAssetPath(url.pathname)) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const exact = await fetchAssetCandidate(request, env);
  if (exact && frameworkAssetUsable(exact, url.pathname)) return exact;

  // assetPrefix changes browser URLs, but Cloudflare's static bundle may still
  // store the physical file at /_next, /_vinext or /assets. Try that exact
  // static object before allowing the application router to see the request.
  const strippedRequest=stripSharedAssetPrefix(request);
  const strippedUrl=new URL(strippedRequest.url);
  const fallback=await fetchAssetCandidate(strippedRequest,env);
  if (fallback && frameworkAssetUsable(fallback,strippedUrl.pathname)) return fallback;

  return null;
}

function isSensitiveClientPath(pathname: string) {
  if (pathname.startsWith("/api/admin")) return true;
  return (
    pathname.startsWith("/projects/") &&
    /\/(?:admin(?:-login)?|change-password)(?:\/|$)/.test(pathname)
  );
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const externalUrl = new URL(request.url);
    const sharedPlatform = isSharedPlatformRequest(externalUrl, env);
    const isolatedAssetRequest = isSharedAssetPath(externalUrl.pathname);
    const directPrefixedAsset = isolatedAssetRequest
      ? await fetchPrefixedFrameworkAsset(request, env)
      : null;

    const internalRequest = isolatedAssetRequest && !directPrefixedAsset
      ? stripSharedAssetPrefix(request)
      : request;
    const internalUrl = new URL(internalRequest.url);

    let response: Response;

    if (directPrefixedAsset) {
      response = directPrefixedAsset;
    } else if (internalUrl.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      response = await handleImageOptimization(
        internalRequest,
        {
          fetchAsset: (path) =>
            env.ASSETS.fetch(new Request(new URL(path, internalRequest.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
    } else {
      response = await handler.fetch(internalRequest, env, ctx);
    }

    // On the shared boss domain, only Rekixo pages/assets are rewritten.
    // The boss/Vercel root site never enters this Worker because no broad /* route exists.
    if (
      sharedPlatform &&
      !directPrefixedAsset &&
      (externalUrl.pathname.startsWith("/projects/") || isolatedAssetRequest)
    ) {
      response = await rewriteSharedAssets(response);
    }

    const secured = new Response(response.body, response);
    secured.headers.set("x-content-type-options", "nosniff");
    secured.headers.set("referrer-policy", "strict-origin-when-cross-origin");
    secured.headers.set("x-frame-options", "SAMEORIGIN");
    secured.headers.set(
      "permissions-policy",
      "camera=(), microphone=(), geolocation=()",
    );

    if (
      externalUrl.pathname.startsWith("/admin") ||
      isSensitiveClientPath(externalUrl.pathname)
    ) {
      secured.headers.set("cache-control", "no-store");
    }

    return secured;
  },
};

export default worker;
