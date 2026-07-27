import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Mark these as external to prevent bundling issues:
  // - pdf-parse: template-literal requires that Turbopack can't trace
  // - jsdom, @mozilla/readability: pull in Node internals + native-adjacent
  //   modules that Vercel's serverless bundler struggles to trace, and would
  //   silently crash the route module at load time (visible as an HTML 500).
  serverExternalPackages: ['pdf-parse', 'jsdom', '@mozilla/readability'],
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
