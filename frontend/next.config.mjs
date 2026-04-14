/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // In local dev, forward /api/* to the Python FastAPI app on :8787.
    // On Vercel, vercel.json handles routing instead (this block is a no-op
    // in production because NEXT_PUBLIC_LOCAL_API is unset).
    if (process.env.NEXT_PUBLIC_LOCAL_API !== "1") return [];
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8787/api/:path*",
      },
    ];
  },
};

export default nextConfig;
