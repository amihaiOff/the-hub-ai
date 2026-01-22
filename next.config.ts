import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Mark pdf-parse as external to prevent bundling issues with dynamic require
  // The library uses template literal requires that Turbopack can't trace
  serverExternalPackages: ['pdf-parse'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
