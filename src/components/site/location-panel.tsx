import Link from "next/link";

import { LiveTrackButton } from "@/components/site/live-track-button";

/**
 * Where an experience happens (FR-03).
 *
 * **There is deliberately no embedded map here yet.** An interactive Google map
 * needs the Maps JavaScript API key published to the browser, and no Google
 * account has been arranged for this project — so an embed would be a grey box
 * with a "for development purposes only" watermark across it, on the page that
 * has to persuade someone to book. What this renders instead is the information
 * a traveller actually acts on, plus a link that opens their own map
 * application, which needs no key and no account and works today.
 *
 * The link uses the documented `google.com/maps` URL scheme rather than an
 * embed. It is a plain hyperlink, so it costs nothing, loads nothing, and
 * tracks nobody until the traveller chooses to follow it.
 *
 * When a key exists, the embed replaces the placeholder block below and this
 * component is the only file that changes.
 *
 * The live tracker is the exception that needs no key: it opens on demand,
 * over keyless OpenStreetMap tiles, and only when the traveller asks for it.
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
