"use client";

import { useEffect, useState } from "react";
import { Footprints } from "lucide-react";

import {
  fetchWalkingRoute,
  formatEta,
  walkingEtaSeconds,
} from "@/components/map/live-map-tracking";
import { cn } from "@/lib/cn";

export interface LiveWalkingEtaProps {
  readonly latitude: number;
  readonly longitude: number;
  readonly className?: string;
}

/**
 * LiveWalkingEta — displays a live walking travel time in the venue strip.
 *
 * Requirements:
 * - Checks geolocation permission first via navigator.permissions.query.
 *   Only obtains coordinates if permission is already "granted"; never prompts
 *   unsolicited.
 * - Reuses fetchWalkingRoute, walkingEtaSeconds, and formatEta from live-map-tracking.ts.
 * - If GPS is unavailable, permission is denied/prompt, or OSRM fails and only
 *   the straight-line fallback is available (route.source !== "road"), returns null
 *   to avoid showing misleading walking ETAs.
 * - Handles loading and errors quietly without throwing or displaying broken states.
 */
export function LiveWalkingEta({ latitude, longitude, className }: LiveWalkingEtaProps) {
  const [eta, setEta] = useState<string | null>(null);

  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !("geolocation" in navigator) ||
      !navigator.permissions ||
      typeof navigator.permissions.query !== "function"
    ) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    navigator.permissions
      .query({ name: "geolocation" })
      .then((permissionStatus) => {
        if (cancelled) return;

        const evaluatePosition = () => {
          if (permissionStatus.state !== "granted") {
            setEta(null);
            return;
          }

          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (cancelled) return;
              const from = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              const to = { lat: latitude, lng: longitude };

              fetchWalkingRoute(from, to, { signal: controller.signal })
                .then((route) => {
                  if (cancelled) return;
                  // Only display walking ETA if a real road network route was resolved.
                  if (route.source === "road") {
                    const seconds = walkingEtaSeconds(route.distanceMetres);
                    setEta(formatEta(seconds));
                  } else {
                    setEta(null);
                  }
                })
                .catch(() => {
                  // Silently ignore network / abort failures
                  if (!cancelled) setEta(null);
                });
            },
            () => {
              // Silently ignore location errors
              if (!cancelled) setEta(null);
            },
            { enableHighAccuracy: false, timeout: 8_000, maximumAge: 60_000 },
          );
        };

        evaluatePosition();
        permissionStatus.onchange = () => {
          if (!cancelled) evaluatePosition();
        };
      })
      .catch(() => {
        // Permissions API unsupported or rejected; do not prompt
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [latitude, longitude]);

  if (!eta) return null;

  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1.5 font-medium text-accent", className)}
    >
      <span className="text-fg-subtle" aria-hidden="true">
        ·
      </span>
      <Footprints
        className="h-3.5 w-3.5 shrink-0 text-accent"
        strokeWidth={1.6}
        aria-hidden="true"
      />
      <span>{eta} walk</span>
    </span>
  );
}
