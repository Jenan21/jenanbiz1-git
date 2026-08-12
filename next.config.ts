import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;
