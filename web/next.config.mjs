/** @type {import('next').NextConfig} */
const API_ORIGIN = process.env.NEUROVIS_API_ORIGIN || "http://localhost:3000";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
    ];
  },
};

export default nextConfig;
