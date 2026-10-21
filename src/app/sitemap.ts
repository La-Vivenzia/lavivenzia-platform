import type { MetadataRoute } from "next";

import { getDiscoveryService } from "@/lib/container";
import { env } from "@/lib/env";

/**
 * The sitemap, built from what is actually published.
 *
 * `REQUIREMENTS.md` asks for indexable destination and experience pages, and an
 * index cannot find what nothing links to deeply. Generated rather than
 * hand-written, so it can never list a listing that has been suspended — the
 * discovery service cannot reach one.
 *
 * `force-dynamic` because the catalogue changes when an operator approves
 * something, and a sitemap cached at build time would be wrong within a day.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const discovery = getDiscoveryService();
  const base = env.APP_URL.replace(/\/$/, "");

  const [experiences, destinations, categories] = await Promise.all([
    discovery.featured(200),
    discovery.destinations(),
    discovery.categories(),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/experiences`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/destinations`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/categories`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/become-a-host`, changeFrequency: "monthly", priority: 0.6 },
  ];

  return [
    ...staticRoutes,
    ...experiences.map((experience) => ({
      url: `${base}/experiences/${experience.slug}`,
      ...(experience.publishedAt ? { lastModified: experience.publishedAt } : {}),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...destinations.map((destination) => ({
      url: `${base}/destinations/${destination.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...categories.map((category) => ({
      url: `${base}/categories/${encodeURIComponent(category.key)}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
