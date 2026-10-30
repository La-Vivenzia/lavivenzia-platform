import Link from "next/link";

import { LiveTrackButton } from "@/components/site/live-track-button";
import { buildLocationEmbed } from "@/components/map/location-embed";

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

  const hasPoint = latitude !== null && longitude !== null;

  /**
   * The documented "search" URL scheme. `query` accepts a coordinate pair, and
   * the label rides in the URL only as a fragment the map application shows —
   * no key, no SDK, no script.
   */
  const mapHref = hasPoint
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : null;

  const embed = buildLocationEmbed({
    latitude,
    longitude,
    address: lines.join(", "),
    googleApiKey: GOOGLE_EMBED_API_KEY,
  });

  return (
    <section className="border-line flex flex-col gap-4 border-t pt-10">
      <span className="eyebrow">Where it happens</span>

      <address className="text-text-muted text-[14px] leading-relaxed not-italic">
        {lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </address>

      {embed ? (
        <div className="border-line bg-surface-sunken rounded-card aspect-[4/3] w-full overflow-hidden border sm:aspect-[16/9]">
          <iframe
            src={embed.src}
            title={`Map showing where ${title} takes place`}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="block h-full w-full border-0"
          />
        </div>
      ) : null}

      {latitude !== null && longitude !== null && slug ? (
        <div className="flex flex-col gap-2">
          <LiveTrackButton slug={slug} title={title} latitude={latitude} longitude={longitude} />
          <p className="text-text-subtle text-[12px]">
            Walk there with a live map — distance and time update as you move.
          </p>
        </div>
      ) : null}

      {mapHref ? (
        <Link
          href={mapHref}
          // A cross-origin destination the traveller chose. `noreferrer` keeps
          // the referring URL — which carries their search filters — off the
          // request to Google.
          target="_blank"
          rel="noopener noreferrer"
          className="text-gold-deep hover:text-gold w-fit text-[13px] underline underline-offset-4"
        >
          Open {title} on a map
          <span className="sr-only"> (opens in a new tab)</span>
        </Link>
      ) : (
        <p className="text-text-subtle text-[12px]">
          The host has not pinned an exact location for this experience.
        </p>
      )}
    </section>
  );
}
