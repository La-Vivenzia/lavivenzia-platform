"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  LiveTravelCopilot,
  type CopilotPreset,
  type TrackRequest,
} from "@/components/copilot/LiveTravelCopilot";
import { parseTrackHash, trackHash, type TrackTarget } from "@/components/copilot/track-target";
import type { CopilotMood } from "@/modules/copilot/types";

/**
 * Owns the Live Travel Copilot for a page: the drawer, the floating launcher,
 * and the `open()` that any trigger on the page calls.
 *
 * A link to `#copilot` also opens it — on load and on hash change — so a
 * server-rendered anchor, or a page without this provider linking to
 * `/#copilot`, reaches the drawer without needing client code of its own.
 * `#live-map` opens it with the live-tracking tip showing, and
 * `#track=<slug>` opens it straight onto the tracker for that listing.
 */

const COPILOT_HASH = "#copilot";
const LIVE_MAP_HASH = "#live-map";

interface CopilotContextValue {
  readonly open: (preset?: { query?: string; mood?: CopilotMood; liveMap?: boolean }) => void;
  /** Opens straight onto the live map tracker for one listing. */
  readonly track: (target: TrackTarget) => void;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

export function useCopilot(): CopilotContextValue | null {
  return useContext(CopilotContext);
}

export function CopilotProvider({ children }: { readonly children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [preset, setPreset] = useState<CopilotPreset | undefined>(undefined);
  const [trackRequest, setTrackRequest] = useState<TrackRequest | undefined>(undefined);

  const open = useCallback<CopilotContextValue["open"]>((next) => {
    if (
      next &&
      (next.query !== undefined || next.mood !== undefined || next.liveMap !== undefined)
    ) {
      setPreset((current) => ({ ...next, nonce: (current?.nonce ?? 0) + 1 }));
    }
    setIsOpen(true);
  }, []);

  const track = useCallback<CopilotContextValue["track"]>((target) => {
    setTrackRequest((current) => ({ ...target, nonce: (current?.nonce ?? 0) + 1 }));
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    function openFromHash() {
      const { hash } = window.location;
      const slug = parseTrackHash(hash);
      if (hash !== COPILOT_HASH && hash !== LIVE_MAP_HASH && slug === null) return;
      // Clear the hash so the same link opens the drawer again next time.
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
      if (slug !== null) track({ slug });
      else if (hash === LIVE_MAP_HASH) open({ liveMap: true });
      else setIsOpen(true);
    }
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [open, track]);

  const value = useMemo(() => ({ open, track }), [open, track]);

  return (
    <CopilotContext.Provider value={value}>
      {children}

      <LiveTravelCopilot
        open={isOpen}
        onClose={close}
        preset={preset}
        trackRequest={trackRequest}
      />
    </CopilotContext.Provider>
  );
}

/**
 * Opens the copilot from anywhere inside a `CopilotProvider`. Outside one it
 * renders a link to the home page's copilot instead, so it is never inert.
 */
export function CopilotTrigger({
  children,
  className,
  query,
  mood,
  "aria-label": ariaLabel,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly query?: string;
  readonly mood?: CopilotMood;
  readonly "aria-label"?: string;
}) {
  const copilot = useCopilot();

  if (!copilot) {
    return (
      <a href={`/${COPILOT_HASH}`} className={className} aria-label={ariaLabel}>
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={ariaLabel}
      className={className}
      onClick={() =>
        copilot.open({
          ...(query !== undefined ? { query } : {}),
          ...(mood !== undefined ? { mood } : {}),
        })
      }
    >
      {children}
    </button>
  );
}

/**
 * Opens the copilot with the live-tracking tip showing — the general "Live Map"
 * entry, for when there is no one listing to track yet. Outside a provider it
 * links to the home page's `#live-map`.
 */
export function LiveMapTrigger({
  children,
  className,
  "aria-label": ariaLabel,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly "aria-label"?: string;
}) {
  const copilot = useCopilot();

  if (!copilot) {
    return (
      <a href={`/${LIVE_MAP_HASH}`} className={className} aria-label={ariaLabel}>
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={ariaLabel}
      className={className}
      onClick={() => copilot.open({ liveMap: true })}
    >
      {children}
    </button>
  );
}

/**
 * Opens the copilot straight onto the live map tracker for one listing. Pass
 * the stored coordinates when you have them; with only a slug the copilot
 * looks them up. Outside a provider it links to `/#track=<slug>`.
 */
export function LiveTrackTrigger({
  target,
  children,
  className,
  "aria-label": ariaLabel,
}: {
  readonly target: TrackTarget;
  readonly children: ReactNode;
  readonly className?: string;
  readonly "aria-label"?: string;
}) {
  const copilot = useCopilot();

  if (!copilot) {
    return (
      <a href={`/${trackHash(target.slug)}`} className={className} aria-label={ariaLabel}>
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={ariaLabel}
      className={className}
      onClick={() => copilot.track(target)}
    >
      {children}
    </button>
  );
}
