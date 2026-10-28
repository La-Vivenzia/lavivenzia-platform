import type { NextConfig } from "next";

type RemotePattern = Exclude<
  NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]>[number],
  URL
>;

/**
 * Hosts `next/image` may optimise from. Everything else is rejected with 400,
 * so the optimiser cannot be used as an open proxy.
 */
const remotePatterns: RemotePattern[] = [
  { protocol: "https", hostname: "assets.lavivenzia.com" },
  { protocol: "https", hostname: "images.unsplash.com" },
  // R2 public buckets.
  { protocol: "https", hostname: "**.r2.dev" },
  // Supabase Storage, public buckets only.
  { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/**" },
];

// The media domain from configuration, so a custom R2 domain works without a
// code change. Read at build time: Next.js fixes this list when it builds.
const mediaBaseUrl = process.env.S3_PUBLIC_BASE_URL;
if (mediaBaseUrl) {
  try {
    const { protocol, hostname, port } = new URL(mediaBaseUrl);
    remotePatterns.push({
      protocol: protocol === "http:" ? "http" : "https",
      hostname,
      ...(port ? { port } : {}),
    });
  } catch {
    // An invalid value is reported by env validation at startup; it should not
    // also break the build here.
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // The worker and the web app share `src/modules`. Server-only packages must
  // not be bundled into the client graph.
  serverExternalPackages: ["pino", "pg-boss", "@prisma/client"],

  // Fail the production build on type errors rather than shipping them.
  // Linting is a separate CI step (`npm run lint`) rather than part of `build`.
  typescript: { ignoreBuildErrors: false },

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns,
  },

  // Do not leak framework details to clients.
  poweredByHeader: false,
};

export default nextConfig;
