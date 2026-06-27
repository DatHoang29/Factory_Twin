/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['three'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
      {
        source: '/socket.io',
        destination: 'http://localhost:3001/socket.io',
      },
      {
        source: '/socket.io/:path*',
        destination: 'http://localhost:3001/socket.io/:path*',
      },
      {
        source: '/uploads/:path*',
        destination: 'http://localhost:3001/uploads/:path*',
      },
    ];
  },
  experimental: {
    allowedDevOrigins: ['localhost:3000', '*.ngrok-free.app', '5761-115-73-141-205.ngrok-free.app'],
  },
};

export default nextConfig;