import type { NextConfig } from "next";

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
  },

  // Do not leak framework details to clients.
  poweredByHeader: false,
};

export default nextConfig;
