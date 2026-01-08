import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for IIS deployment
  output: "export",

  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },

  // Trailing slashes help with IIS routing
  trailingSlash: true,
};

export default nextConfig;
