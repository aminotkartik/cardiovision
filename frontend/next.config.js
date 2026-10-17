/** @type {import('next').NextConfig} */
const backendOrigin = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

const nextConfig = {
  allowedDevOrigins: ['*.e2b.app', '*.vercel.app'],
  async rewrites() {
    return [
      {
        source: '/backend/:path*',
        destination: `${backendOrigin}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
