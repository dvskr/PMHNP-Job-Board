import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable Turbopack - use Webpack instead
  // Required for @react-pdf/renderer compatibility
  experimental: {
    turbo: false,
  },
};

export default nextConfig;
