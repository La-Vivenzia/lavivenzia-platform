"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Crown, Smartphone } from "lucide-react";

import { Wordmark } from "@/components/ui/wordmark";
import { cn } from "@/lib/cn";
import type { VipPrivilege } from "@/modules/journeys/data";

/** Degrees. Small on purpose — DESIGN.md §B.8 prefers small movements. */
const MAX_TILT = 7;

/** iOS 13+ gates orientation behind a permission prompt on a user gesture. */
type OrientationWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

/**
 * A journey pass: the matched archetype, the journey and its headline
 * privilege, set on the pine panel with a gold hairline.
 *
 * The card tilts toward the pointer, or with the phone where the device
 * reports orientation, and a soft gold light follows the tilt. The motion only
 * ever answers input — nothing loops (§B.8) — and under
 * `prefers-reduced-motion` the card is static.
 *
 * Tilt is written to CSS custom properties on the element rather than held in
 * React state, so a 60 Hz sensor stream does not re-render the tree.
 *
 * The reference printed on the card is a display string, not a credential:
 * there is no membership system behind it.
 */
export function VipPassCard({
  holder,
  journeyTitle,
  privilege,
  reference,
  className,
}: {
  readonly holder: string;
  readonly journeyTitle: string;
  readonly privilege: VipPrivilege;
  readonly reference: string;
  readonly className?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [needsTiltPermission, setNeedsTiltPermission] = useState(false);
  const [tiltListening, setTiltListening] = useState(false);

  const applyTilt = useCallback((x: number, y: number) => {
    // x, y in [-1, 1]: x is left→right, y is top→bottom.
    const node = cardRef.current;
    if (!node) return;
    node.style.setProperty("--lv-tilt-x", `${(-y * MAX_TILT).toFixed(2)}deg`);
    node.style.setProperty("--lv-tilt-y", `${(x * MAX_TILT).toFixed(2)}deg`);
    node.style.setProperty("--lv-sheen-x", `${(50 + x * 40).toFixed(1)}%`);
    node.style.setProperty("--lv-sheen-y", `${(50 + y * 40).toFixed(1)}%`);
  }, []);

  // Browser capabilities cannot be read during server render; see Reveal.tsx.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMotionAllowed(!reduce);
    if (reduce || typeof DeviceOrientationEvent === "undefined") return;

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (!coarse) return;

    const Orientation = DeviceOrientationEvent as OrientationWithPermission;
    if (typeof Orientation.requestPermission === "function") {
      setNeedsTiltPermission(true);
    } else {
      setTiltListening(true);
    }
  }, []);

  useEffect(() => {
    if (!tiltListening) return;
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.gamma === null || event.beta === null) return;
      // A phone is held at roughly 45° — treat that as level.
      applyTilt(clamp(event.gamma / 30, 1), clamp((event.beta - 45) / 30, 1));
    };
    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, [tiltListening, applyTilt]);

  const requestTilt = async () => {
    const Orientation = DeviceOrientationEvent as OrientationWithPermission;
    try {
      const result = await Orientation.requestPermission?.();
      if (result === "granted") setTiltListening(true);
    } catch {
      // Declined or unavailable: the pointer still works, the card stays usable.
    }
    setNeedsTiltPermission(false);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!motionAllowed || event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    applyTilt(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      ((event.clientY - rect.top) / rect.height) * 2 - 1,
    );
  };

  return (
    <div className={cn("[perspective:1000px]", className)}>
      <div
        ref={cardRef}
        role="group"
        aria-label={`Journey pass for ${holder}: ${journeyTitle}`}
        onPointerMove={onPointerMove}
        onPointerLeave={() => applyTilt(0, 0)}
        className={cn(
          "relative isolate aspect-[1.586/1] w-full overflow-hidden rounded-card border border-accent/45 bg-panel p-5 text-panel-fg shadow-raised xs:p-6",
          "[transform:rotateX(var(--lv-tilt-x,0deg))_rotateY(var(--lv-tilt-y,0deg))]",
          motionAllowed && "transition-transform duration-200 ease-out",
        )}
      >
        {/* The gold light. It moves only when the card does. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-70"
          style={{
            background:
              "radial-gradient(circle at var(--lv-sheen-x, 30%) var(--lv-sheen-y, 20%), color-mix(in oklab, var(--lv-accent) 26%, transparent), transparent 58%)",
          }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-[7px] -z-10 rounded-[calc(var(--radius-card)-7px)] border border-accent/20"
        />

        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3">
            <Wordmark size="sm" tone="gold" />
            <span className="eyebrow text-[9px] text-panel-fg/70">Journey Pass</span>
          </div>

          <div className="mt-auto">
            <p className="font-display text-[19px] leading-tight text-accent xs:text-[22px]">
              {holder}
            </p>
            <p className="mt-1 text-[12px] font-light text-panel-fg/85 xs:text-[13px]">
              {journeyTitle}
            </p>
          </div>

          <div className="mt-4 flex items-end justify-between gap-4 border-t border-accent/25 pt-3">
            <p className="flex min-w-0 items-start gap-1.5 text-[11px] leading-snug text-panel-fg/90 xs:text-[12px]">
              <Crown
                className="mt-px h-[13px] w-[13px] shrink-0 text-accent"
                strokeWidth={1.6}
                aria-hidden="true"
              />
              <span className="truncate">{privilege.title}</span>
            </p>
            <p className="shrink-0 text-[10px] tracking-[0.14em] text-panel-fg/70 tabular-nums">
              <span className="sr-only">Pass reference </span>
              {reference}
            </p>
          </div>
        </div>
      </div>

      {needsTiltPermission ? (
        <button
          type="button"
          onClick={requestTilt}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-pill px-3 text-[12px] text-fg-muted hover:text-fg"
        >
          <Smartphone className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
          Tilt the pass with your phone
        </button>
      ) : null}
    </div>
  );
}
