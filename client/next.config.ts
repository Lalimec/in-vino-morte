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

  // Environment variables for static export (mobile builds)
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
  },
};

export default nextConfig;
