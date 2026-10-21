import Link from "next/link";
import Image from "next/image";
import type { Destination } from "@/modules/discovery/ports";

/**
 * A destination tile.
 *
 * Destinations are derived from the cities that currently have something
 * published (A-013), so a tile always leads somewhere with listings in it —
 * there is no empty destination to land on.
 */
export function DestinationCard({ destination }: { readonly destination: Destination }) {
  return (
    <Link
      href={`/destinations/${destination.slug}`}
      className="group bg-ink relative isolate flex aspect-[3/2] items-end overflow-hidden"
    >
      {destination.coverUrl ? (
        <Image
          src={destination.coverUrl}
          alt=""
          fill
          sizes="(min-width: 1024px) 380px, (min-width: 640px) 45vw, 90vw"
          className="-z-10 object-cover opacity-70 transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.04]"
        />
      ) : null}

      {/* Scrim, so the type stays legible over any photograph. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background: "linear-gradient(to top, rgba(23,20,15,0.92) 0%, rgba(23,20,15,0.15) 70%)",
        }}
      />

      <div className="text-text-inverse flex w-full flex-col gap-1 p-6">
        <h3 className="font-display text-[20px] leading-tight">{destination.city}</h3>
        <p className="text-text-inverse-muted text-[11px] tracking-[0.14em] uppercase">
          {destination.experienceCount}{" "}
          {destination.experienceCount === 1 ? "experience" : "experiences"}
        </p>
      </div>
    </Link>
  );
}
