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

import { LiveTravelCopilot, type CopilotPreset } from "@/components/copilot/LiveTravelCopilot";
import { GenieSparkle } from "@/components/icons";
import { cn } from "@/lib/cn";
import type { CopilotMood } from "@/modules/copilot/types";

/**
 * Owns the Live Travel Copilot for a page: the drawer, the floating launcher,
 * and the `open()` that any trigger on the page calls.
 *
 * A link to `#copilot` also opens it — on load and on hash change — so a
 * server-rendered anchor, or a page without this provider linking to
 * `/#copilot`, reaches the drawer without needing client code of its own.
 */

const COPILOT_HASH = "#copilot";

interface CopilotContextValue {
  readonly open: (preset?: { query?: string; mood?: CopilotMood }) => void;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

export function useCopilot(): CopilotContextValue | null {
  return useContext(CopilotContext);
}

export function CopilotProvider({ children }: { readonly children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [preset, setPreset] = useState<CopilotPreset | undefined>(undefined);

  const open = useCallback<CopilotContextValue["open"]>((next) => {
    if (next && (next.query !== undefined || next.mood !== undefined)) {
      setPreset((current) => ({ ...next, nonce: (current?.nonce ?? 0) + 1 }));
    }
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    function openFromHash() {
      if (window.location.hash !== COPILOT_HASH) return;
      // Clear the hash so the same link opens the drawer again next time.
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
      setIsOpen(true);
    }
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <CopilotContext.Provider value={value}>
      {children}

      {/* Floating launcher: above the mobile tab bar, bottom-right on desktop. */}
      <button
        type="button"
        onClick={() => open()}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={cn(
          "fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 lg:right-8 lg:bottom-8",
          "inline-flex h-12 items-center gap-2 rounded-pill bg-cta pr-5 pl-4 text-[13.5px] font-medium text-cta-fg shadow-editorial",
          "transition-[background-color,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          "hover:-translate-y-px hover:bg-cta-hover active:translate-y-0",
          isOpen && "pointer-events-none opacity-0",
        )}
      >
        <GenieSparkle className="h-[18px] w-[18px] text-accent" />
        Live Travel Copilot
      </button>

      <LiveTravelCopilot open={isOpen} onClose={close} preset={preset} />
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
