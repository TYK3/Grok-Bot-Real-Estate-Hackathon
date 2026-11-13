import path from "node:path";
import type { NextConfig } from "next";

// Pages read the fact contracts, the listing data and the review workbench from
// the repo root at request time. Tracing from the repo root lets a deployment
// (Vercel) bundle those files with the server functions.
const DATA = ["../fact_record/contracts/*.json", "../work/*.json"];

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  outputFileTracingIncludes: {
    // /review serves the static workbench and its sample documents too
    "/**": [...DATA, "../conflict-resolution-ui/**/*", "../fact_record/**/*"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.homeflow-assets.co.uk",
      },
    ],
  },
};

export default nextConfig;
