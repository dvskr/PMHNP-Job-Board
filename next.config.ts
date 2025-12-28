import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Webpack is used by default (Turbopack is opt-in in Next.js 16)
  // This ensures compatibility with @react-pdf/renderer
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
