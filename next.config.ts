import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  // lib/library/packs-loader.ts and lib/gate/packs.ts read the test-pack YAML at runtime; ship it with every
  // server function on Vercel (route glob '/**' matches all routes).
  outputFileTracingIncludes: {
    "/**": ["./lib/library/packs/*.yaml"],
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
