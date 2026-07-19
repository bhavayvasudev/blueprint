import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // packages/ui and packages/shared-types ship TypeScript source, not a
  // prebuilt dist (ARCHITECTURE.md §18) — Next.js needs to transpile them
  // itself rather than treating them as pre-compiled node_modules.
  transpilePackages: ["@blueprint/ui", "@blueprint/shared-types"],
  images: {
    // Contributor avatars on the Briefing. Scoped to GitHub's avatar CDN
    // and nothing else — the host is fixed, and `search` is intentionally
    // left unconstrained because GitHub serves these with a `?v=` cache
    // buster that is part of the URL it hands us.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
