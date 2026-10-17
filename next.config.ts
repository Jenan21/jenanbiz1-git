import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
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
  // The report PDF reads the font and the letterhead from `public` at request time; list them so the deployed function carries them.
  outputFileTracingIncludes: {
    "/api/projects/[projectId]/analysis-report": ["./public/assets/fonts/Alexandria-VariableFont_wght.ttf", "./public/assets/letterhead/jenan-pro-letterhead.jpg"],
    "/api/user/reports/[id]/pdf": ["./public/assets/fonts/Alexandria-VariableFont_wght.ttf", "./public/assets/letterhead/jenan-pro-letterhead.jpg"],
  },
  agentRules: false,
  experimental: {
    authInterrupts: true,
    // A small machine can cap the parallel build workers (each one holds a copy of the app in memory).
    ...(Number(process.env.NEXT_BUILD_CPUS) > 0 ? { cpus: Number(process.env.NEXT_BUILD_CPUS) } : {}),
  },
  async headers() {
    return [
      {
        // The file name carries a version, so the browser and the CDN can keep it for good.
        source: "/assets/gateway-world.v1.svg",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
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

const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_PROJECT);

export default withSentryConfig(nextConfig, {
  org: "jenanpro",
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,
  silent: !process.env.CI,
  sourcemaps: {
    disable: !uploadSourceMaps,
    deleteSourcemapsAfterUpload: true,
  },
  release: {
    name: process.env.SENTRY_RELEASE,
    create: uploadSourceMaps,
    finalize: uploadSourceMaps,
  },
});
