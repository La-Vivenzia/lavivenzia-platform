import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";

import { LiveTrackButton } from "@/components/site/live-track-button";
import { LocationMapPreview } from "@/components/map/LocationMapPreview";
import { buildLocationEmbed } from "@/components/map/location-embed";
import { isValidLatitude, isValidLongitude } from "@/modules/discovery/geo";

/**
 * A browser key, so it is read from the public variable — never from
 * `GOOGLE_MAPS_API_KEY`, which is the server's Places key. See
 * `location-embed.ts` for the restrictions it must carry.
 */
const GOOGLE_EMBED_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

/**
 * Where an experience happens (FR-03).
 *
 * **The embedded map.** A pinned listing always shows a real map:
 *
 * - With `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` set, the Google Maps Embed API —
 *   an iframe, no script on our page, and no per-load charge.
 * - Without it, the OpenStreetMap embed, which needs no key and no account.
 *
 * The choice and the URLs live in `buildLocationEmbed`, which is pure and
 * tested. The iframe loads lazily, so a traveller who never scrolls this far
 * never fetches a tile, and it sends only our origin as the referrer — enough
 * for Google to check the key's referrer restriction, not enough to leak the
 * search filters in the page URL.
 *
 * The "open on a map" link stays beneath the embed: it hands the traveller to
 * their own map application, which is where they will actually navigate from.
 *
 * The live tracker opens on demand, over keyless OpenStreetMap tiles, and only
 * when the traveller asks for it.
 *
 * **What is shown and what is not.** A published listing carries an address the
 * host chose to publish, so it is shown. A precise meeting point is a different
 * thing — it belongs after a booking, not before one — and no such field exists
 * yet; when it does, it must not be rendered here.
 */
export function LocationPanel({
  addressLine,
  city,
  region,
  country,
  postalCode,
  latitude,
  longitude,
  title,
  slug,
}: {
  readonly addressLine: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly country: string;
  readonly postalCode: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly title: string;
  /** Enables the live tracker when the listing has a pinned point. */
  readonly slug?: string;
}) {
  const lines = [addressLine, [city, region].filter(Boolean).join(", "), postalCode, country]
    .map((line) => line?.trim())
    .filter((line): line is string => !!line);

  // Nothing to show. A heading over an empty block is worse than no section.
  if (lines.length === 0 && latitude === null) return null;

  const hasValidPoint =
    latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    isValidLatitude(latitude) &&
    isValidLongitude(longitude);

  /**
   * The documented "search" URL scheme. `query` accepts a coordinate pair, and
   * the label rides in the URL only as a fragment the map application shows —
   * no key, no SDK, no script.
   */
  const mapHref = hasValidPoint
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : null;

  const embed = !hasValidPoint
    ? buildLocationEmbed({
        latitude,
        longitude,
        address: lines.join(", "),
        googleApiKey: GOOGLE_EMBED_API_KEY,
      })
    : null;

  return (
    <section className="border-line flex flex-col gap-5 border-t pt-8 sm:pt-10">
      <div className="flex flex-col gap-2">
        <span className="eyebrow text-accent-ink">Where it happens</span>
        <div className="flex items-start gap-2 text-[14px] text-fg-muted">
          <MapPin
            className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink"
            strokeWidth={1.6}
            aria-hidden="true"
          />
          <address className="not-italic leading-relaxed font-light">{lines.join(" · ")}</address>
        </div>
        <p className="text-fg-subtle text-[12.5px] font-light leading-relaxed">
          The exact meeting point and directions are provided in your booking confirmation.
        </p>
      </div>

      {hasValidPoint ? (
        <div className="group relative aspect-[4/3] w-full overflow-hidden rounded-card border border-line bg-surface shadow-card sm:aspect-[16/9]">
          <LocationMapPreview latitude={latitude} longitude={longitude} title={title} />
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-pill border border-line/80 bg-bg/90 px-3 py-1 text-[11px] font-medium text-heading shadow-sm backdrop-blur-md">
            <MapPin
              className="h-3 w-3 shrink-0 text-accent-ink"
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <span className="tracking-wide">Pinned Venue</span>
          </div>
        </div>
      ) : embed ? (
        <div className="group relative aspect-[4/3] w-full overflow-hidden rounded-card border border-line bg-surface shadow-card sm:aspect-[16/9]">
          <iframe
            src={embed.src}
            title={`Map showing where ${title} takes place`}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="block h-full w-full border-0 transition-opacity duration-300"
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {hasValidPoint && slug ? (
          <div className="flex flex-col gap-1.5">
            <LiveTrackButton slug={slug} title={title} latitude={latitude} longitude={longitude} />
            <p className="text-fg-subtle text-[12px] font-light">
              Walk there with a live map — distance and time update as you move.
            </p>
          </div>
        ) : (
          <p className="text-fg-subtle text-[12px] font-light">
            The host has not pinned an exact location for this experience.
          </p>
        )}

        {mapHref ? (
          <Link
            href={mapHref}
            // A cross-origin destination the traveller chose. `noreferrer` keeps
            // the referring URL — which carries their search filters — off the
            // request to Google.
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-accent-ink hover:text-accent text-[12.5px] font-medium tracking-wide transition-colors sm:self-start"
          >
            <span>Open in Google Maps</span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}
