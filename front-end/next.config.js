/**
 * Development proxy: rewrite /api/* to backend to avoid CORS during local development.
 * It will use NEXT_PUBLIC_API_BASE_URL if provided, otherwise http://127.0.0.1:8000
 */
//const backend = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000';

/**const nextConfig = {
  output: 'export',
  basePath: '/s',
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL
  },
};

module.exports = nextConfig;**/

/**module.exports = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backend}/api/:path*`, // Proxy to backend
      },
    ];
  },
};**/

const isDev = process.env.NODE_ENV === 'development';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''; // '' for base domain, or '/s' if using a subfolder
const backend = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000';

const nextConfig = {
  // Always write a static site to /out when you run `npm run build`
  output: 'export',

  // Leave '' for base domain; set '/s' only if deploying to a subfolder
  basePath,

  // Helpful on shared hosts
  trailingSlash: true,

  // Allow next/image without the server optimizer (static hosting)
  images: { unoptimized: true },

  // Expose to client code (read from .env files)
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_BASE_PATH: basePath,
  },

  // Dev-only proxy so `next dev` can call your backend without CORS issues.
  // Rewrites are ignored by `next export`, which is what we want.
  async rewrites() {
    if (!isDev) return [];
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
    ];
  },
};

module.exports = nextConfig;