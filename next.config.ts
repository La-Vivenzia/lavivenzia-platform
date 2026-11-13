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
  // Google-hosted photography (lh3.googleusercontent.com and siblings).
  { protocol: "https", hostname: "**.googleusercontent.com" },
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

/**
 * The host portal. Host onboarding and the host console moved out of the
 * traveller product; the old routes forward there so bookmarks and emailed
 * links keep working. The host API under `/api/v1/host` is not redirected.
 *
 * Temporary (307) while the portal settles, so browsers and search engines do
 * not cache a destination that may still change.
 */
const HOST_PORTAL_URL = "https://host.lavivenzia.com";

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

  async redirects() {
    return [
      { source: "/become-a-host", destination: HOST_PORTAL_URL, permanent: false },
      // `:path*` matches zero or more segments, so this covers `/host` itself.
      { source: "/host/:path*", destination: HOST_PORTAL_URL, permanent: false },

      // Step 1 Consolidation: absorb duplicate search into VivenIQ, trips into Journeys,
      // and taxonomy index pages into the unified collection view.
      { source: "/concierge", destination: "/viveniq", permanent: true },
      { source: "/concierge/:path*", destination: "/viveniq", permanent: true },
      { source: "/trips/architect", destination: "/journeys", permanent: true },
      { source: "/trips/:path*", destination: "/journeys", permanent: true },
      { source: "/destinations", destination: "/experiences", permanent: true },
      { source: "/destinations/:slug", destination: "/experiences?city=:slug", permanent: true },
      { source: "/categories", destination: "/experiences", permanent: true },
      { source: "/categories/:key", destination: "/experiences?category=:key", permanent: true },
    ];
  },
};

export default nextConfig;
