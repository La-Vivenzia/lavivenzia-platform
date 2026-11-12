"use client";

import "leaflet/dist/leaflet.css";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type * as Leaflet from "leaflet";
import type { DivIcon, Map as LeafletMap, Marker, Polyline, TileLayer } from "leaflet";
import {
  ArrowLeft,
  CarFront,
  Footprints,
  KeyRound,
  LocateFixed,
  Navigation,
  PartyPopper,
  Pause,
  Play,
  SkipForward,
} from "lucide-react";

import { Alert, Skeleton } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";
import {
  JOURNEY_START,
  MAP_TILES,
  OFF_ROUTE_METRES,
  SIMULATION_METRES_PER_TICK,
  SIMULATION_TICK_MS,
  STOP_ARRIVAL_RADIUS_METRES,
  STOP_STATUS_LABELS,
  advanceJourney,
  bearingDegrees,
  fetchJourneyLegs,
  fetchWalkingRoute,
  formatDistance,
  formatEta,
  googleMapsDirectionsUrl,
  googleMapsJourneyUrl,
  hasArrived,
  haversineMetres,
  isOffRoute,
  pointAlongRoute,
  remainingMetres,
  routeLengthMetres,
  skipToNextStop,
  stopStatus,
  travelEtaSeconds,
  travelModeFor,
  type JourneyProgress,
  type JourneyStop,
  type LatLng,
  type StopStatus,
  type WalkingRoute,
} from "@/components/map/live-map-tracking";

/**
 * Live map tracker — a full-bleed map from the traveller to one venue, or
 * through every act of a curated journey, with a floating HUD of distance and
 * travel time that updates as they move.
 *
 * Two modes, one component:
 *
 * - **Single destination** (`destination`): the copilot's "take me there".
 * - **Journey** (`stops`): the companion map. Act pins carry status badges,
 *   the active act is routed live from the traveller, the legs still ahead
 *   are drawn faintly, and the act advances on arrival-then-departure — or by
 *   hand. On arrival the HUD repeats the pass's secret keyword.
 *
 * Every destination is a listing's stored coordinates; nothing on screen is
 * generated (CLAUDE.md §7). Each external dependency degrades on its own:
 *
 * - **Location** off or unavailable: the chosen starting point stands in, and
 *   the HUD says the position is approximate.
 * - **Routing** (OSRM) slow or down: a dashed straight line, and the HUD says
 *   the distance is as the crow flies.
 * - **Tiles** failing: a notice over the map; the HUD keeps working.
 * - **Leaflet** failing to load: an error with the Google Maps link.
 *
 * Leaflet touches `window` at import, so it is loaded inside an effect. The
 * caller should also load this component with `next/dynamic` and `ssr: false`
 * so the library and its CSS only ship when someone opens the tracker.
 */

type GpsStatus = "locating" | "live" | "denied" | "unavailable" | "unsupported";
type MapStatus = "loading" | "ready" | "error";
type LeafletModule = typeof Leaflet;

interface Layers {
  readonly L: LeafletModule;
  readonly map: LeafletMap;
  readonly tiles: TileLayer;
  readonly you: Marker;
  readonly route: Polyline;
  readonly casing: Polyline;
  readonly ahead: Polyline;
  readonly stops: readonly Marker[];
}

/** Don't hammer the public routing server while someone wanders off-route. */
const REROUTE_COOLDOWN_MS = 15_000;

/** Below this, a GPS heading is noise from standing still. */
const MIN_HEADING_SPEED_MPS = 0.5;

const GPS_NOTES: Partial<Record<GpsStatus, string>> = {
  locating: "Finding your location…",
  denied: "Location is off — starting from your chosen spot, so distance is approximate.",
  unavailable: "No location fix yet — starting from your chosen spot.",
  unsupported: "This browser can't share a location — starting from your chosen spot.",
};

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );

const COMPASS_HTML =
  '<span class="lv-map-compass lv-map-compass--still">' +
  '<span class="lv-map-compass__halo"></span>' +
  '<span class="lv-map-compass__body"><span class="lv-map-compass__needle"></span></span>' +
  '<span class="lv-map-compass__label">You (VIP Traveler)</span>' +
  "</span>";

function stopIcon(L: LeafletModule, stop: JourneyStop, index: number, status: StopStatus): DivIcon {
  return L.divIcon({
    className: "",
    html:
      `<span class="lv-map-stop lv-map-stop--${status}">` +
      `<span class="lv-map-stop__pin">${index + 1}</span>` +
      `<span class="lv-map-stop__label">Act ${index + 1} · ${escapeHtml(stop.role)}</span>` +
      "</span>",
    iconSize: [40, 60],
    iconAnchor: [20, 19],
  });
}

interface CommonProps {
  /** Where the traveller said they are — used until (or unless) GPS answers. */
  readonly fallbackOrigin: LatLng;
  readonly onClose: () => void;
  /** The back button's accessible name — where closing the map takes you. */
  readonly closeLabel?: string;
  /** Shows the walk simulator. Defaults to development builds only. */
  readonly allowSimulation?: boolean;
}

interface SingleDestinationProps extends CommonProps {
  readonly destination: LatLng;
  readonly destinationLabel: string;
  readonly stops?: undefined;
  readonly journeyTitle?: undefined;
  readonly secretKeyword?: undefined;
}

interface JourneyProps extends CommonProps {
  /** At least one stop, in act order. Keep the array stable between renders. */
  readonly stops: readonly JourneyStop[];
  readonly journeyTitle?: string;
  /** Repeated on arrival so the traveller has it at the door. */
  readonly secretKeyword?: string;
  readonly destination?: undefined;
  readonly destinationLabel?: undefined;
}

export function LiveMapTracker(props: SingleDestinationProps | JourneyProps) {
  const {
    fallbackOrigin,
    onClose,
    closeLabel = "Back to suggestions",
    allowSimulation = process.env.NODE_ENV !== "production",
  } = props;
  const journeyMode = props.stops !== undefined;
  const titleId = useId();

  const singleDestination = props.destination;
  const singleLabel = props.destinationLabel;
  const journeyStops = props.stops;
  const stops = useMemo<readonly JourneyStop[]>(
    () =>
      journeyStops ?? [
        {
          name: singleLabel ?? "",
          role: "Destination",
          coordinates: singleDestination!,
          address: "",
        },
      ],
    [journeyStops, singleLabel, singleDestination],
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const layersRef = useRef<Layers | null>(null);
  const lastRerouteRef = useRef(0);
  const lastFixRef = useRef<LatLng | null>(null);

  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const [tilesFailing, setTilesFailing] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("locating");
  const [gpsPosition, setGpsPosition] = useState<LatLng | null>(null);
  const [gpsHeading, setGpsHeading] = useState<number | null>(null);
  const [routeFrom, setRouteFrom] = useState<LatLng>(fallbackOrigin);
  const [route, setRoute] = useState<WalkingRoute | null>(null);
  const [legs, setLegs] = useState<readonly WalkingRoute[] | null>(null);
  const [progress, setProgress] = useState<JourneyProgress>(JOURNEY_START);
  const [follow, setFollow] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [simMetres, setSimMetres] = useState(0);
  /** Where the simulated walker stands while the next leg's route loads. */
  const [simAnchor, setSimAnchor] = useState<LatLng | null>(null);

  const activeIndex = journeyMode ? progress.activeIndex : 0;
  const activeStop = stops[activeIndex]!;
  const destination = journeyMode ? activeStop.coordinates : singleDestination!;
  const destinationLabel = activeStop.name;

  const simPosition = simulating
    ? route
      ? pointAlongRoute(route.points, simMetres)
      : simAnchor
    : null;
  const position = simPosition ?? gpsPosition ?? fallbackOrigin;
  const approximate = !simPosition && !gpsPosition;
  const arrived = journeyMode
    ? progress.arrived || hasArrived(position, destination, STOP_ARRIVAL_RADIUS_METRES)
    : hasArrived(position, destination);
  const metresLeft = arrived ? 0 : remainingMetres(position, route, destination);
  const travelMode = journeyMode
    ? travelModeFor(route?.distanceMetres ?? haversineMetres(position, destination))
    : "walking";

  const simHeading =
    simulating && route && simMetres > 0
      ? bearingDegrees(
          pointAlongRoute(route.points, Math.max(0, simMetres - 5)),
          pointAlongRoute(route.points, simMetres),
        )
      : null;
  const heading = simulating ? simHeading : gpsHeading;

  /* ---------------------------------------------------------------- map */

  useEffect(() => {
    let cancelled = false;
    let created: LeafletMap | null = null;

    (async () => {
      try {
        const mod = await import("leaflet");
        const L = (mod as unknown as { default?: LeafletModule }).default ?? mod;
        if (cancelled || !mapRef.current) return;

        const map = L.map(mapRef.current, { zoomControl: false, attributionControl: true });
        created = map;
        L.control.zoom({ position: "topright" }).addTo(map);

        const tiles = L.tileLayer(MAP_TILES.url, {
          attribution: MAP_TILES.attribution,
          maxZoom: MAP_TILES.maxZoom,
          detectRetina: false,
        }).addTo(map);
        let tileErrors = 0;
        tiles.on("tileerror", () => {
          tileErrors += 1;
          if (tileErrors >= 4) setTilesFailing(true);
        });
        tiles.on("tileload", () => {
          tileErrors = 0;
          setTilesFailing(false);
        });

        // The legs still ahead: faint and dashed, beneath the live route.
        const ahead = L.polyline([], {
          className: "lv-map-route-ahead",
          weight: 3,
          opacity: 0.7,
          dashArray: "4 8",
          lineCap: "round",
          lineJoin: "round",
          interactive: false,
        }).addTo(map);
        const casing = L.polyline([], {
          className: "lv-map-route-casing",
          weight: 9,
          opacity: 0.9,
          lineCap: "round",
          lineJoin: "round",
          interactive: false,
        }).addTo(map);
        const route = L.polyline([], {
          className: "lv-map-route",
          weight: 5,
          lineCap: "round",
          lineJoin: "round",
          interactive: false,
        }).addTo(map);

        const stopMarkers = journeyMode
          ? stops.map((stop, index) =>
              L.marker([stop.coordinates.lat, stop.coordinates.lng], {
                icon: stopIcon(L, stop, index, stopStatus(index, 0)),
                title: `Act ${index + 1}: ${stop.name}`,
                alt: `Act ${index + 1}: ${stop.name}`,
                keyboard: false,
              }).addTo(map),
            )
          : [
              L.marker([destination.lat, destination.lng], {
                icon: L.divIcon({
                  className: "",
                  html: '<span class="lv-map-venue"></span>',
                  iconSize: [34, 34],
                  iconAnchor: [17, 34],
                }),
                title: destinationLabel,
                alt: destinationLabel,
                keyboard: false,
              }).addTo(map),
            ];

        const you = L.marker([fallbackOrigin.lat, fallbackOrigin.lng], {
          icon: L.divIcon({
            className: "",
            html: COMPASS_HTML,
            iconSize: [44, 44],
            iconAnchor: [22, 22],
          }),
          title: "You",
          alt: "Your position",
          keyboard: false,
          zIndexOffset: 1000,
        }).addTo(map);

        map.fitBounds(
          L.latLngBounds([
            [fallbackOrigin.lat, fallbackOrigin.lng],
            ...stops.map(
              (stop) => [stop.coordinates.lat, stop.coordinates.lng] as [number, number],
            ),
          ]),
          { padding: [48, 48], maxZoom: 17 },
        );
        // A drag means the traveller wants to look around; stop following.
        map.on("dragstart", () => setFollow(false));

        layersRef.current = { L, map, tiles, you, route, casing, ahead, stops: stopMarkers };
        setMapStatus("ready");
      } catch {
        if (!cancelled) setMapStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      layersRef.current = null;
      created?.remove();
    };
    // The map is built once per mount; later changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------ location */

  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- capability probe of an external API
      setGpsStatus("unsupported");
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      (fix) => {
        const next = { lat: fix.coords.latitude, lng: fix.coords.longitude };
        const { heading: reported, speed } = fix.coords;
        const previous = lastFixRef.current;
        if (
          reported !== null &&
          Number.isFinite(reported) &&
          (speed ?? 0) >= MIN_HEADING_SPEED_MPS
        ) {
          setGpsHeading(reported);
        } else if (previous && haversineMetres(previous, next) >= 5) {
          // No compass from the device: infer the heading from the last move.
          setGpsHeading(bearingDegrees(previous, next));
        }
        lastFixRef.current = next;
        setGpsPosition(next);
        setGpsStatus("live");
      },
      (error) => {
        setGpsStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  // Redraw the route from the traveller when they are off the drawn route —
  // including the first fix, when the route was drawn from the assumed start —
  // or when the last attempt fell back to a straight line.
  useEffect(() => {
    if (!gpsPosition || !route || simulating) return;
    if (haversineMetres(gpsPosition, routeFrom) < OFF_ROUTE_METRES) return;
    if (route.source === "road" && !isOffRoute(gpsPosition, route)) return;
    const now = Date.now();
    if (now - lastRerouteRef.current < REROUTE_COOLDOWN_MS) return;
    lastRerouteRef.current = now;
    setRouteFrom(gpsPosition);
  }, [gpsPosition, route, routeFrom, simulating]);

  /* --------------------------------------------------------------- route */

  useEffect(() => {
    const controller = new AbortController();
    fetchWalkingRoute(routeFrom, destination, { signal: controller.signal })
      .then(setRoute)
      .catch(() => {
        // Aborted by a newer request; that one will answer.
      });
    return () => controller.abort();
  }, [routeFrom, destination]);

  // The legs between acts do not move, so they are fetched once.
  useEffect(() => {
    if (!journeyMode || stops.length < 2) return;
    const controller = new AbortController();
    fetchJourneyLegs(stops, { signal: controller.signal })
      .then(setLegs)
      .catch(() => {
        // Unmounted or superseded.
      });
    return () => controller.abort();
  }, [journeyMode, stops]);

  /* ------------------------------------------------------------ journey */

  const moveTo = useCallback((next: JourneyProgress, from: LatLng) => {
    setProgress(next);
    setRoute(null);
    setRouteFrom(from);
    setSimAnchor(from);
    setSimMetres(0);
    setFollow(true);
  }, []);

  const { lat, lng } = position;

  // Arrival marks the act reached; leaving it afterwards moves to the next.
  useEffect(() => {
    if (!journeyMode) return;
    const next = advanceJourney(progress, { lat, lng }, stops);
    if (next === progress) return;
    if (next.activeIndex !== progress.activeIndex) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- progress follows the external position stream
      moveTo(next, { lat, lng });
    } else {
      setProgress(next);
    }
  }, [journeyMode, lat, lng, stops, progress, moveTo]);

  function goToNextAct() {
    const next = skipToNextStop(progress, stops);
    if (next !== progress) moveTo(next, position);
  }

  /* ---------------------------------------------------------- simulation */

  // The simulator walks the drawn route and parks at its end, so the arrival
  // state stays on screen until the tester stops it or moves to the next act.
  const simLength = route ? routeLengthMetres(route.points) : 0;
  const simWalking = simulating && route !== null && simMetres < simLength;
  useEffect(() => {
    if (!simWalking) return;
    const timer = window.setInterval(() => {
      setSimMetres((metres) => Math.min(metres + SIMULATION_METRES_PER_TICK, simLength));
    }, SIMULATION_TICK_MS);
    return () => window.clearInterval(timer);
  }, [simWalking, simLength]);

  function toggleSimulation() {
    if (simulating) {
      setSimulating(false);
      return;
    }
    setSimMetres(0);
    setSimAnchor(position);
    setFollow(true);
    setSimulating(true);
  }

  /* ------------------------------------------------------- draw & follow */

  const fitView = useCallback(
    (at: LatLng, animate: boolean) => {
      const layers = layersRef.current;
      if (!layers) return;
      const hudHeight = hudRef.current?.offsetHeight ?? 0;
      layers.map.fitBounds(
        [
          [at.lat, at.lng],
          [destination.lat, destination.lng],
        ],
        {
          paddingTopLeft: [48, 72],
          paddingBottomRight: [48, hudHeight + 40],
          maxZoom: 18,
          animate,
        },
      );
    },
    [destination],
  );

  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    const points = route?.points.map((p) => [p.lat, p.lng] as [number, number]) ?? [];
    const dash = route?.source === "straight" ? "2 10" : "";
    layers.route.setLatLngs(points).setStyle({ dashArray: dash });
    layers.casing.setLatLngs(route?.source === "road" ? points : []);
  }, [route, mapStatus]);

  // Leg k joins act k to act k + 1; draw only those still ahead.
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers || !journeyMode) return;
    const ahead = (legs ?? []).slice(activeIndex);
    layers.ahead.setLatLngs(
      ahead.map((leg) => leg.points.map((p) => [p.lat, p.lng] as [number, number])),
    );
  }, [legs, activeIndex, journeyMode, mapStatus]);

  useEffect(() => {
    const layers = layersRef.current;
    if (!layers || !journeyMode) return;
    layers.stops.forEach((marker, index) => {
      const status = stopStatus(index, activeIndex);
      marker.setIcon(stopIcon(layers.L, stops[index]!, index, status));
      marker.setZIndexOffset(status === "active" ? 500 : 0);
    });
  }, [activeIndex, journeyMode, stops, mapStatus]);

  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.you.setLatLng([lat, lng]);
    if (follow) fitView({ lat, lng }, true);
  }, [lat, lng, follow, fitView, mapStatus]);

  // The needle turns with the heading; with none, the compass shows a star.
  useEffect(() => {
    const compass = layersRef.current?.you
      .getElement()
      ?.querySelector<HTMLElement>(".lv-map-compass");
    if (!compass) return;
    compass.classList.toggle("lv-map-compass--still", heading === null);
    if (heading !== null) compass.style.setProperty("--lv-heading", `${heading.toFixed(0)}deg`);
  }, [heading, mapStatus]);

  function recenter() {
    setFollow(true);
    fitView(position, true);
  }

  /* ---------------------------------------------------- focus and keys */

  useEffect(() => {
    const restore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });
    return () => restore?.focus({ preventScroll: true });
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // A drawer behind may have its own Escape and focus trap; keep ours local.
    event.stopPropagation();
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (event.key !== "Tab" || !rootRef.current) return;
    const focusable = rootRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* -------------------------------------------------------------- render */

  const from = approximate ? null : position;
  const mapsUrl = journeyMode
    ? googleMapsJourneyUrl(stops, activeIndex, from, travelMode)
    : googleMapsDirectionsUrl(destination, from, "walking");
  const statusLabel = simulating
    ? "Simulating walk"
    : gpsStatus === "live"
      ? "Live GPS"
      : gpsStatus === "locating"
        ? "Locating"
        : "Approximate";
  const note = simulating || gpsStatus === "live" ? null : GPS_NOTES[gpsStatus];
  const etaLabel = formatEta(travelEtaSeconds(metresLeft, travelMode));
  const modeLabel = travelMode === "driving" ? "by cab" : "walking";
  const ModeIcon = travelMode === "driving" ? CarFront : Footprints;
  const isLastAct = activeIndex >= stops.length - 1;
  const actsAhead = (legs ?? []).slice(activeIndex);
  const journeyMetresLeft =
    metresLeft + actsAhead.reduce((sum, leg) => sum + leg.distanceMetres, 0);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      className="absolute inset-0 z-10 overflow-hidden bg-bg"
    >
      <div
        ref={mapRef}
        role="region"
        aria-label={
          journeyMode
            ? `Map of ${props.journeyTitle ?? "your journey"}`
            : `Map to ${destinationLabel}`
        }
        className="lv-map absolute inset-0 isolate"
      />

      {mapStatus === "loading" ? (
        <div aria-hidden="true" className="absolute inset-0 grid place-items-center bg-bg-soft">
          <Skeleton className="h-full w-full rounded-none" />
        </div>
      ) : null}

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="pointer-events-auto grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-fg shadow-card transition-colors duration-200 hover:bg-surface-2"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
        </button>
        <span className="pointer-events-auto mt-1.5 inline-flex h-8 items-center gap-1.5 rounded-pill border border-line bg-surface px-3 text-[12px] font-medium text-fg shadow-card">
          <span
            aria-hidden="true"
            className={cn(
              "h-2 w-2 rounded-full",
              gpsStatus === "live" || simulating
                ? "bg-success motion-safe:animate-pulse"
                : "bg-fg-subtle",
            )}
          />
          {statusLabel}
        </span>
      </div>

      {tilesFailing ? (
        <div className="absolute inset-x-3 top-20 mx-auto max-w-xl">
          <Alert tone="warning">
            Map images aren&rsquo;t loading. Distance and travel time below are still live.
          </Alert>
        </div>
      ) : null}

      {/* HUD */}
      <div
        ref={hudRef}
        className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] mx-auto max-w-xl rounded-card border border-line bg-surface p-4 shadow-editorial lg:p-5"
      >
        <p className="eyebrow text-[10.5px] text-fg-subtle">
          {journeyMode
            ? `Stop ${activeIndex + 1} of ${stops.length} · Act ${activeIndex + 1}: ${activeStop.role}`
            : "Live tracking"}
        </p>
        <h2
          id={titleId}
          className="mt-1 line-clamp-1 font-display text-[17px] leading-snug text-heading"
        >
          {destinationLabel}
        </h2>

        {journeyMode && stops.length > 1 ? (
          <ol aria-label="Acts" className="mt-3 flex flex-wrap gap-1.5">
            {stops.map((stop, index) => {
              const status = stopStatus(index, activeIndex);
              return (
                <li
                  key={`${stop.role}-${index}`}
                  aria-current={status === "active" ? "step" : undefined}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-pill border px-2.5 text-[11.5px]",
                    status === "active"
                      ? "border-transparent bg-panel text-panel-fg"
                      : status === "next"
                        ? "border-line-strong text-fg"
                        : "border-line text-fg-muted",
                  )}
                >
                  <span className="font-medium">
                    Act {index + 1}: {stop.role}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className={status === "active" ? "text-accent" : undefined}>
                    {STOP_STATUS_LABELS[status]}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : null}

        {mapStatus === "error" ? (
          <div className="mt-3">
            <Alert tone="danger" title="The map couldn't load">
              Open the route in Google Maps instead.
            </Alert>
          </div>
        ) : arrived ? (
          <div role="status" className="mt-3">
            <p className="flex items-center gap-2 text-[15px] font-medium text-heading">
              <PartyPopper
                className="h-5 w-5 text-accent-ink dark:text-accent"
                strokeWidth={1.8}
                aria-hidden="true"
              />
              {journeyMode ? `You have arrived at Act ${activeIndex + 1}.` : "You’ve arrived"}
            </p>
            {journeyMode && props.secretKeyword ? (
              <p className="mt-2 inline-flex items-center gap-2 rounded-pill bg-panel px-3 py-1.5 text-[13px] text-panel-fg">
                <KeyRound className="h-4 w-4 text-accent" strokeWidth={1.8} aria-hidden="true" />
                Secret keyword:{" "}
                <span className="font-semibold tracking-[0.12em] text-accent">
                  {props.secretKeyword}
                </span>
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 flex items-end gap-5">
            <div>
              <div className="font-display text-[26px] leading-none text-heading tabular-nums">
                {route ? formatDistance(metresLeft) : <Skeleton className="h-6 w-16" />}
              </div>
              <p className="mt-1.5 text-[11.5px] text-fg-muted">
                {route?.source === "straight" ? "as the crow flies" : "to go"}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-display text-[26px] leading-none text-heading tabular-nums">
                <ModeIcon
                  className="h-5 w-5 text-accent-ink dark:text-accent"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                {route ? etaLabel : <Skeleton className="h-6 w-14" />}
              </div>
              <p className="mt-1.5 text-[11.5px] text-fg-muted">{modeLabel}</p>
            </div>
            {journeyMode && !isLastAct && legs ? (
              <div className="ml-auto text-right">
                <div className="text-[14px] leading-none text-fg tabular-nums">
                  {formatDistance(journeyMetresLeft)}
                </div>
                <p className="mt-1.5 text-[11.5px] text-fg-muted">whole journey</p>
              </div>
            ) : null}
          </div>
        )}

        {/* Screen-reader summary, announced politely — not every GPS tick. */}
        <p className="sr-only" aria-live="polite">
          {route && !arrived ? `${formatDistance(metresLeft)}, about ${etaLabel} ${modeLabel}` : ""}
        </p>

        {note || route?.source === "straight" ? (
          <p role="status" className="mt-3 text-[12px] leading-relaxed text-fg-muted">
            {[
              note,
              route?.source === "straight"
                ? "Walking route unavailable — showing a straight line."
                : null,
            ]
              .filter(Boolean)
              .join(" ")}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-pill bg-cta px-4 text-[13px] font-medium text-cta-fg transition-colors duration-200 hover:bg-cta-hover"
          >
            <Navigation className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            Google Maps
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <button
            type="button"
            onClick={recenter}
            disabled={mapStatus !== "ready"}
            aria-pressed={follow}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-pill border border-line-strong px-4 text-[13px] font-medium text-fg transition-colors duration-200 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LocateFixed className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            Recenter
          </button>
          {journeyMode && !isLastAct ? (
            <button
              type="button"
              onClick={goToNextAct}
              className={cn(
                "inline-flex h-11 items-center justify-center gap-1.5 rounded-pill border px-4 text-[13px] font-medium transition-colors duration-200",
                arrived
                  ? "border-transparent bg-panel text-panel-fg hover:opacity-90"
                  : "border-line-strong text-fg hover:bg-surface-2",
              )}
            >
              <SkipForward className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              {arrived ? `On to Act ${activeIndex + 2}` : `Skip to Act ${activeIndex + 2}`}
            </button>
          ) : null}
          {allowSimulation ? (
            <button
              type="button"
              onClick={toggleSimulation}
              disabled={!route || mapStatus !== "ready"}
              aria-pressed={simulating}
              className={cn(
                "inline-flex h-11 items-center justify-center gap-1.5 rounded-pill border px-4 text-[13px] font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50",
                simulating
                  ? "border-transparent bg-surface-3 text-fg"
                  : "border-dashed border-line-strong text-fg-muted hover:bg-surface-2",
              )}
            >
              {simulating ? (
                <Pause className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              )}
              {simulating ? "Stop sim" : "Simulate walk"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
