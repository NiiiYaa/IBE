const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'hg-static.hyperguest.com',
      },
      {
        protocol: 'https',
        hostname: 'hg-static.s3.eu-central-1.amazonaws.com',
      },
    ],
  },
  // Proxy all /api/* requests to the backend API server.
  // The browser always talks to the same origin (port 3000) and Next.js
  // forwards the request server-side to the API (port 3001).
  // This removes the need for CORS and works whether the browser is local or remote.
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
