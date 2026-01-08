import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Note: Static export disabled because dynamic routes (/game/[code], /lobby/[code])
  // cannot be pre-generated - room codes are created at runtime
  // output: "export",

  // Disable image optimization (not needed for this app)
  images: {
    unoptimized: true,
  },

  // Trailing slashes help with routing
  trailingSlash: true,
};

export default nextConfig;
