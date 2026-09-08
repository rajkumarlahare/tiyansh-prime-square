/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

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

const SHARED_ASSET_PREFIX = "/__rekixo";
const REKIXO_ASSET_ROOTS = ["assets", "_next", "_vinext"] as const;

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
  if (url.pathname !== SHARED_ASSET_PREFIX && !url.pathname.startsWith(`${SHARED_ASSET_PREFIX}/`)) {
    return request;
  }
  url.pathname = url.pathname.slice(SHARED_ASSET_PREFIX.length) || "/";
  return new Request(url.toString(), request);
}

function rewriteAssetReferences(text: string) {
  return text.replace(
    /(["'(=])\/(assets|_next|_vinext)\//g,
    (_match, prefix: string, root: string) => `${prefix}${SHARED_ASSET_PREFIX}/${root}/`,
  );
}

function shouldRewriteBody(contentType: string) {
  const type = contentType.toLowerCase();
  return (
    type.includes("text/html") ||
    type.includes("text/css") ||
    type.includes("javascript") ||
    type.includes("text/x-component") ||
    type.includes("application/json")
  );
}

async function rewriteSharedAssets(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (!response.body || !shouldRewriteBody(contentType)) return response;

  const body = rewriteAssetReferences(await response.text());
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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
    const isolatedAssetRequest =
      externalUrl.pathname === SHARED_ASSET_PREFIX ||
      externalUrl.pathname.startsWith(`${SHARED_ASSET_PREFIX}/`);

    const internalRequest = isolatedAssetRequest
      ? stripSharedAssetPrefix(request)
      : request;
    const internalUrl = new URL(internalRequest.url);

    let response: Response;

    if (internalUrl.pathname === "/_vinext/image") {
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
