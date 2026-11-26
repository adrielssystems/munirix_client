if (process.env.CLIENT_NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = process.env.CLIENT_NEXTAUTH_URL;
} else if (!process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = 'https://client.munirix.net';
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
