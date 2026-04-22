import path from "path";
import { fileURLToPath } from "url";

/** @type {import('next').NextConfig} */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ORIGIN = process.env.NEUROVIS_API_ORIGIN || "http://localhost:3000";

const nextConfig = {
  reactStrictMode: true,
  /** Monorepo: parent folder has its own lockfile — keep tracing scoped to `web/`. */
  outputFileTracingRoot: path.join(__dirname),
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
    ];
  },
};

export default nextConfig;
