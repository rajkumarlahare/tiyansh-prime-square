import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep every framework-emitted JS/CSS/static URL inside Rekixo-owned isolated
  // shared-domain namespace. This prevents boss-site/Vercel asset collisions.
  assetPrefix: "/__rekixo",
  experimental: {
    serverActions: {
      bodySizeLimit: "64mb",
    },
  },
};

export default nextConfig;
