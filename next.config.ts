import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Mark pdf-parse as external — it uses template-literal requires that
  // Turbopack can't trace. jsdom is no longer used (the wiki fetch-source
  // extractor is regex-only, see lib/wiki/fetch-source.ts) — its
  // html-encoding-sniffer transitive dep pulls in an ESM-only package
  // that Vercel's serverless CJS wrapper couldn't `require`.
  serverExternalPackages: ['pdf-parse'],
  // Tree-shake barrel imports from these packages so a route only bundles the
  // icons / helpers it actually uses (cuts the high per-route chunk counts).
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', 'recharts'],
  },
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
