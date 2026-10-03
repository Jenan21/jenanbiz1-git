import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  reactStrictMode: true,
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/projects/*/report": [
      "./node_modules/@fontsource-variable/alexandria/files/alexandria-{latin,arabic}-wght-normal.woff2",
      "./public/assets/jenan-pro-logo.jpg",
    ],
  },
  agentRules: false,
  async headers() {
    return [{
      source: "/api/:path*",
      headers: [
        { key: "Cache-Control", value: "private, no-store, max-age=0" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    }];
  },
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;
