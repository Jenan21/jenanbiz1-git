import type { NextConfig } from "next";
import { ENFORCED_CSP_DIRECTIVES } from "./lib/security/csp";
import { securityHeaders } from "./lib/security/headers";

const production = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  agentRules: false,
  experimental: {
    authInterrupts: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...securityHeaders,
          {
            key: "Content-Security-Policy",
            // upgrading requests would break the plain-http development and test servers
            value: [...ENFORCED_CSP_DIRECTIVES, ...(production ? ["upgrade-insecure-requests"] : [])].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
