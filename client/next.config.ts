import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export - dynamic routes work client-side only (no SSR needed)
  output: "export",

  // Disable image optimization (not needed for this app)
  images: {
    unoptimized: true,
  },

  // Trailing slashes help with routing
  trailingSlash: true,
};

export default nextConfig;
