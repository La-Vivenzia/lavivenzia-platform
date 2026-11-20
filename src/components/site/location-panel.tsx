"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { KeyRound, MapPin } from "lucide-react";

import { LiveTrackButton } from "@/components/site/live-track-button";
import { LiveWalkingEta } from "@/components/site/live-walking-eta";
import { LocationMapPreview } from "@/components/map/LocationMapPreview";
import { isValidLatitude, isValidLongitude } from "@/modules/discovery/geo";

const LiveMapTracker = dynamic(
  () => import("@/components/map/LiveMapTracker").then((mod) => mod.LiveMapTracker),
  { ssr: false },
);

/**
 * Where an experience happens (FR-03).
 *
 * Minimal quiet-luxury map system:
 * - When valid pinned coordinates exist: renders a static Leaflet preview map
 *   with a compact horizontal strip (venue name and neighborhood) and on-demand
 *   LiveTrackButton navigation.
 * - When Live Tracking is open: renders only the live companion map, hiding the
 *   underlying preview map until tracking is closed.
 * - When coordinates are missing: renders a secluded private-address notice
 *   informing the patron that the exact venue address is disclosed upon booking.
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
  const [isTracking, setIsTracking] = useState(false);

  useEffect(() => {
    function handleStartTracking(event: Event) {
      const customEvent = event as CustomEvent<{ slug?: string }>;
      if (!slug || !customEvent.detail?.slug || customEvent.detail.slug === slug) {
        setIsTracking(true);
      }
    }

    function checkHash() {
      if (window.location.hash.startsWith("#track=")) {
        const hashSlug = window.location.hash.slice(7).trim();
        if (!slug || !hashSlug || hashSlug === slug) {
          setIsTracking(true);
        }
      }
    }

    checkHash();
    window.addEventListener("lavivenzia:start-live-tracking", handleStartTracking);
    window.addEventListener("hashchange", checkHash);

    return () => {
      window.removeEventListener("lavivenzia:start-live-tracking", handleStartTracking);
      window.removeEventListener("hashchange", checkHash);
    };
  }, [slug]);

  const lines = [addressLine, [city, region].filter(Boolean).join(", "), postalCode, country]
    .map((line) => line?.trim())
    .filter((line): line is string => !!line);

  const hasValidPoint =
    latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    isValidLatitude(latitude) &&
    isValidLongitude(longitude);

  return (
    <section className="border-line flex flex-col gap-5 border-t pt-8 sm:pt-10">
      <div className="flex flex-col gap-2">
        <span className="eyebrow text-accent-ink">Where it happens</span>
        {lines.length > 0 ? (
          <div className="flex items-start gap-2 text-[14px] text-fg-muted">
            <MapPin
              className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink"
              strokeWidth={1.6}
              aria-hidden="true"
            />
            <address className="not-italic leading-relaxed font-light">{lines.join(" · ")}</address>
          </div>
        ) : null}
        <p className="text-fg-subtle text-[12.5px] font-light leading-relaxed">
          The exact meeting point and directions are provided in your booking confirmation.
        </p>
      </div>

      {hasValidPoint ? (
        <div className="flex flex-col gap-3">
          {/* Live Tracking map view — replaces preview while active */}
          {isTracking ? (
            <div className="fixed inset-0 z-[60]">
              <LiveMapTracker
                destination={{ lat: latitude, lng: longitude }}
                destinationLabel={title}
                onClose={() => setIsTracking(false)}
                closeLabel="Close live tracking"
              />
            </div>
          ) : null}

          {/* Underlying venue preview map — hidden while live tracking is active */}
          {!isTracking ? (
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
          ) : null}

          {/* Compact horizontal venue name and neighborhood strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 text-[13px] shadow-sm">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="font-medium text-heading truncate">{title}</span>
              {city || region ? (
                <>
                  <span className="text-fg-subtle" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-fg-muted font-light truncate">
                    {[city, region].filter(Boolean).join(", ")}
                  </span>
                </>
              ) : null}
              <LiveWalkingEta latitude={latitude} longitude={longitude} />
            </div>
          </div>
        </div>
      ) : (
        <div className="relative flex aspect-[16/9] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-card border border-line bg-surface p-6 text-center shadow-card sm:aspect-[21/9]">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-accent/25 bg-accent/10 text-accent">
            <KeyRound className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <div className="flex max-w-sm flex-col gap-1">
            <p className="font-display text-[15px] font-normal text-heading">
              Private address disclosed upon booking confirmation.
            </p>
            <p className="font-sans text-[12.5px] font-light leading-relaxed text-fg-muted">
              To preserve the seclusion of this venue, the precise address and entry coordinates are
              provided directly to confirmed guests.
            </p>
          </div>
        </div>
      )}

      {hasValidPoint && slug ? (
        <div className="flex flex-col gap-1.5">
          <LiveTrackButton
            slug={slug}
            title={title}
            latitude={latitude}
            longitude={longitude}
            onTrack={() => setIsTracking(true)}
          />
          <p className="text-fg-subtle text-[12px] font-light">
            Walk there with live tracking — distance and time update as you move.
          </p>
        </div>
      ) : null}
    </section>
  );
}
