"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import type { HeroImage } from "@/lib/home-content";

/** How long each photograph holds before the next one fades in. */
const INTERVAL_MS = 5000;

type HeroVisualProps = {
  readonly images: readonly HeroImage[];
  /** Focal point for `object-position`; each breakpoint frames the crop differently. */
  readonly objectPosition: string;
  /** Placement and scale of the slide indicator inside the frame. */
  readonly indicatorClassName?: string;
  readonly size?: "sm" | "lg";
};

/**
 * The hero photograph as a slow crossfade between published listings.
 *
 * Each slide fades over a second while the visible one drifts in a long
 * Ken Burns zoom. The zoom is applied only under `motion-safe`, and a visitor
 * who asked for less motion gets no autoplay at all — the indicator still lets
 * them step through by hand. Rotation also pauses while the indicator is
 * hovered or focused, and while the tab is hidden.
 *
 * Lives inside the caller's frame (radius, scrim), which stays server-rendered.
 */
export function HeroVisual({
  images,
  objectPosition,
  indicatorClassName,
  size = "sm",
}: HeroVisualProps) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = images.length;

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setActive((index) => (index + 1) % count);
      }
    }, INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [count, paused, active]);

  return (
    <>
      {images.map((image, index) => {
        const isActive = index === active;

        return (
          <div
            key={image.src}
            aria-hidden={!isActive}
            className={cn(
              "absolute inset-0 transition-opacity duration-1000 ease-in-out",
              isActive ? "opacity-100" : "opacity-0",
            )}
          >
            <Image
              src={image.src}
              alt={image.alt}
              fill
              priority={index === 0}
              sizes="50vw"
              className={cn(
                "object-cover will-change-transform",
                // The zoom runs past the hold so it never visibly stops; the
                // reset waits for the fade-out so it is never seen snapping back.
                isActive
                  ? "motion-safe:scale-105 motion-safe:[transition:transform_6500ms_ease-out]"
                  : "scale-100 [transition:transform_0ms_linear_1000ms]",
              )}
              style={{ objectPosition }}
            />
          </div>
        );
      })}

      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: "var(--lv-scrim)" }}
      />

      {count > 1 ? (
        <div
          role="group"
          aria-label="Hero photographs"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className={cn(
            "pointer-events-auto absolute z-10 flex items-center rounded-pill bg-black/25 ring-1 ring-white/25 backdrop-blur-[6px] ring-inset",
            size === "lg" ? "px-2.5 py-1" : "px-1.5 py-0.5",
            indicatorClassName,
          )}
        >
          {images.map((image, index) => {
            const isActive = index === active;

            return (
              <button
                key={image.src}
                type="button"
                onClick={() => setActive(index)}
                aria-label={`Show photograph ${index + 1} of ${count}`}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "group grid place-items-center rounded-pill focus-visible:outline-white",
                  size === "lg" ? "h-7 px-1.5" : "h-6 px-1",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "block rounded-pill transition-[width,background-color] duration-500 ease-out",
                    size === "lg" ? "h-1.5" : "h-1",
                    isActive
                      ? cn("bg-white", size === "lg" ? "w-7" : "w-5")
                      : cn(
                          "bg-white/45 group-hover:bg-white/75",
                          size === "lg" ? "w-1.5" : "w-1",
                        ),
                  )}
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
