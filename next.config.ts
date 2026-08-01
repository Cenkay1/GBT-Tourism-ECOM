import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      // Eski turların /uploads/xxx.jpg referansları da route handler üzerinden
      // servis edilsin (canlıda statik servis çalışmasa bile görünürler).
      beforeFiles: [{ source: "/uploads/:name", destination: "/api/uploads/:name" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
