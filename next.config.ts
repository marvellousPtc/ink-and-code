import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['ali-oss'],
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  turbopack: {
    resolveAlias: {
      canvas: { browser: '' },
    },
  },
  async rewrites() {
    const cortexUrl = process.env.CORTEX_INTERNAL_URL || 'http://localhost:3001';
    return [
      {
        source: '/chat',
        destination: `${cortexUrl}/chat`,
      },
      {
        source: '/chat/:path*',
        destination: `${cortexUrl}/chat/:path*`,
      },
    ];
  },
};

export default nextConfig;
