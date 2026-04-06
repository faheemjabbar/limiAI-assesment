/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_NODE_SERVICE_URL: process.env.NEXT_PUBLIC_NODE_SERVICE_URL ?? "http://localhost:4000",
  },
};

module.exports = nextConfig;
