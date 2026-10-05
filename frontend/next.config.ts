import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '192.168.137.1',
    '192.168.137.6',
    '10.128.115.59',
    'localhost',
    '127.0.0.1',
  ],
};

export default nextConfig;
