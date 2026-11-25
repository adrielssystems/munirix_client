if (process.env.CLIENT_NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = process.env.CLIENT_NEXTAUTH_URL;
} else if (!process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = 'https://client.munirix.net';
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: { unoptimized: true },
};

export default nextConfig;
