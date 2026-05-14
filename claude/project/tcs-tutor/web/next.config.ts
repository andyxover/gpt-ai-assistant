import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow syllabus uploads up to ~10MB through server actions.
  // Default is 1MB which is too small for some PDFs.
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // pdf-parse pulls in pdfjs-dist which uses Web Workers + dynamic
  // imports that don't survive Turbopack server bundling. Treat it
  // as an external Node module instead.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
};

export default nextConfig;
