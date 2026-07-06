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
  async headers() {
    return [
      {
        // Never let the browser's HTTP cache pin an old service worker — this
        // ensures updated SW logic (e.g. cache rules) is picked up promptly.
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
