import type { MetadataRoute } from "next";

import { env } from "@/lib/env";

/**
 * Crawler policy.
 *
 * The consoles and the API are disallowed — not as a security control, which
 * they have of their own, but because an operator review queue appearing in a
 * search result is a brand problem even when the crawler cannot open it.
 */
export default function robots(): MetadataRoute.Robots {
  const base = env.APP_URL.replace(/\/$/, "");

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/host", "/ops", "/api/", "/mfa", "/sign-out"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
