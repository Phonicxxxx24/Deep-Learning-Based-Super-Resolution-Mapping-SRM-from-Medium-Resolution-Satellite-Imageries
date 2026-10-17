import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "8000" },
      { protocol: "http", hostname: "127.0.0.1", port: "8000" },
      { protocol: "https", hostname: "*.railway.app" },
      { protocol: "https", hostname: "*.up.railway.app" },
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://srm-production-e5fc.up.railway.app/api/:path*",
      },
      {
        source: "/static/:path*",
        destination: "https://srm-production-e5fc.up.railway.app/static/:path*",
      },
    ];
  },
};

export default nextConfig;
