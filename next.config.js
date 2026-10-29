/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Promoted from experimental in Next.js 15+
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  images: {
    // Restrict to https-only; http wildcard removed (security hardening)
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    // Disable AVIF and SVG to clear Image Optimization RCE advisories
    // (GHSA-2xp9-vwfh-vxw4, GHSA-2464-fhr4-w9xw)
    formats: ["image/webp"],
    dangerouslyAllowSVG: false,
  },
};

module.exports = nextConfig;
