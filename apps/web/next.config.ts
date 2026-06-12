import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output keeps the Docker image lean when we containerize in Phase 10.
  output: 'standalone',
};

export default nextConfig;
