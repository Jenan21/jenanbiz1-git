import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  reactStrictMode: true,
  agentRules: false,
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;
