import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
