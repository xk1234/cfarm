import { createMDX } from "fumadocs-mdx/next"

const withMDX = createMDX({
  configPath: "source.config.ts",
})

const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

/** @type {import("next").NextConfig} */
const nextConfig = {
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ["radix-ui"],
  },
  outputFileTracingIncludes: {
    "/*": ["assets/fonts/Inter-Variable.ttf"],
  },
  serverExternalPackages: ["node-appwrite"],
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "cfarm-eight.vercel.app",
          },
        ],
        destination: "https://web-production-bd480.up.railway.app/:path*",
        permanent: false,
      },
    ]
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ]
  },
}

export default withMDX(nextConfig)
