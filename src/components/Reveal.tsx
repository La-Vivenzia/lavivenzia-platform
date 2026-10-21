"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

import { cn } from "@/lib/cn";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Stagger in milliseconds, for sequences of sibling elements. */
  delay?: number;
  as?: ElementType;
  id?: string;
};

/**
 * A single, restrained entrance: fade plus a short rise, once, on first view.
 * Under `prefers-reduced-motion` the CSS neutralises it entirely.
 */
export function Reveal({ children, className, delay = 0, as: Tag = "div", id }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    /*
     * No observer available, or the visitor asked for less motion: show the
     * content immediately rather than animating it in.
     *
     * The `set-state-in-effect` rule is disabled for this one line rather than
     * worked around. Both conditions depend on browser capabilities that cannot
     * be read during render without breaking server rendering, so there is no
     * derived-state form of this; and the failure mode if it were removed is
     * the worst kind — content that stays permanently invisible for exactly the
     * users who opted out of animation.
     */
    if (
      typeof window === "undefined" ||
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Same reason as DesktopHeader: destructuring an array yields
        // `IntersectionObserverEntry | undefined` under this project's stricter
        // settings. The observer always delivers at least one entry.
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      id={id}
      className={cn("reveal", className)}
      data-visible={visible ? "true" : "false"}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
