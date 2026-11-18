"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import type { Map as LeafletMap } from "leaflet";

import { MAP_TILES } from "@/components/map/live-map-tracking";
import { cn } from "@/lib/cn";

type LeafletModule = typeof Leaflet;

export interface LocationMapPreviewProps {
  readonly latitude: number;
  readonly longitude: number;
  readonly title: string;
  readonly className?: string;
}

/**
 * A static, client-only Leaflet preview map for experiences with valid pinned coordinates.
 *
 * Uses keyless OpenStreetMap tiles with brand tokens (.lv-map) and the quiet luxury
 * venue pin (.lv-map-venue). Navigation controls, dragging, keyboard and scroll-zoom are disabled
 * to prevent scroll trapping, while retaining required OSM attribution.
 */
export function LocationMapPreview({
  latitude,
  longitude,
  title,
  className,
}: LocationMapPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;

    (async () => {
      try {
        const mod = await import("leaflet");
        const L = (mod as unknown as { default?: LeafletModule }).default ?? mod;
        if (cancelled || !containerRef.current) return;

        map = L.map(containerRef.current, {
          zoomControl: false,
          attributionControl: true,
          dragging: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false,
          touchZoom: false,
        });

        map.setView([latitude, longitude], 15);

        L.tileLayer(MAP_TILES.url, {
          attribution: MAP_TILES.attribution,
          maxZoom: MAP_TILES.maxZoom,
          detectRetina: false,
        }).addTo(map);

        const venueIcon = L.divIcon({
          className: "",
          html: '<span class="lv-map-venue" aria-hidden="true"></span>',
          iconSize: [34, 34],
          iconAnchor: [17, 34],
        });

        L.marker([latitude, longitude], {
          icon: venueIcon,
          title,
          alt: title,
          keyboard: false,
          interactive: false,
        }).addTo(map);
      } catch {
        // Degrades gracefully if Leaflet or tile layer fails to load.
      }
    })();

    return () => {
      cancelled = true;
      if (map) {
        map.remove();
        map = null;
      }
    };
  }, [latitude, longitude, title]);

  return (
    <div
      ref={containerRef}
      aria-label={`Map showing where ${title} takes place`}
      role="region"
      className={cn("lv-map h-full w-full", className)}
    />
  );
}
