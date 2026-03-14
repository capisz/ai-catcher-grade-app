import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const configDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: ["@catcher-intel/contracts"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.mlbstatic.com",
      },
    ],
  },
  turbopack: {
    root: path.join(configDir, "..", ".."),
  },
};

export default nextConfig;
