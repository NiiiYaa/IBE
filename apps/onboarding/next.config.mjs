/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // required for Docker deployment
  env: {
    NEXT_PUBLIC_ONBOARDING_API_URL: process.env.NEXT_PUBLIC_ONBOARDING_API_URL ?? 'http://localhost:3003',
  },
};

export default nextConfig;
