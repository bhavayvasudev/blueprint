import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // packages/ui and packages/shared-types ship TypeScript source, not a
  // prebuilt dist (ARCHITECTURE.md §18) — Next.js needs to transpile them
  // itself rather than treating them as pre-compiled node_modules.
  transpilePackages: ["@blueprint/ui", "@blueprint/shared-types"],
};

export default nextConfig;
