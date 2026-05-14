import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow syllabus uploads up to ~10MB through server actions.
  // Default is 1MB which is too small for some PDFs.
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
