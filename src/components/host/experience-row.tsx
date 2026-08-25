import Link from "next/link";
import Image from "next/image";
import type { ExperienceListItem } from "@/modules/experiences/ports";
import { ExperienceStatusBadge } from "@/components/ui/status";
import { formatMoneyMinor, formatRelativeTime } from "@/lib/format";

/**
 * One listing in the host's inventory.
 *
 * A wide editorial row rather than a card in a grid. Cards force every listing
 * into the same rectangle and the page becomes a wall of boxes; a row gives the
 * photograph a cinematic ratio and lets the title breathe, which is closer to
 * how the listing will actually be read.
 */
export function ExperienceRow({ experience }: { readonly experience: ExperienceListItem }) {
  const price = formatMoneyMinor(experience.basePriceMinor, experience.currency);

  return (
    <Link
      href={`/host/experiences/${experience.id}`}
      className="group bg-surface hover:bg-surface flex flex-col gap-5 px-5 py-5 transition-shadow duration-300 ease-[var(--ease-out-soft)] hover:shadow-panel sm:flex-row sm:items-center sm:gap-7 sm:px-7 sm:py-6"
    >
      <div className="bg-surface-sunken relative aspect-[16/10] w-full shrink-0 overflow-hidden sm:aspect-[4/3] sm:w-40">
        {experience.coverUrl ? (
          <Image
            src={experience.coverUrl}
            alt=""
            fill
            // Small in the layout, so the browser is told not to download a
            // full-width source for a thumbnail.
            sizes="(min-width: 640px) 160px, 100vw"
            className="object-cover transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.03]"
          />
        ) : (
          <div className="text-text-subtle absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] tracking-[0.16em] uppercase">No image</span>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <ExperienceStatusBadge status={experience.status} />
          {experience.city ? (
            <span className="text-text-subtle text-[11px] tracking-[0.12em] uppercase">
              {experience.city}
            </span>
          ) : null}
        </div>

        <h3 className="font-display text-text truncate text-[18px] leading-snug">
          {experience.title}
        </h3>

        {experience.summary ? (
          <p className="text-text-muted line-clamp-2 max-w-xl text-[13px] leading-relaxed">
            {experience.summary}
          </p>
        ) : (
          <p className="text-text-subtle text-[13px] italic">No summary yet</p>
        )}
      </div>

      <div className="flex shrink-0 flex-row items-baseline gap-6 sm:flex-col sm:items-end sm:gap-1.5 sm:text-right">
        <span className="font-display text-text text-[16px]">{price ?? "—"}</span>
        <span className="text-text-subtle text-[11px]">
          {experience.mediaCount} {experience.mediaCount === 1 ? "photo" : "photos"}
        </span>
        <span className="text-text-subtle text-[11px]">
          Edited {formatRelativeTime(experience.updatedAt)}
        </span>
      </div>
    </Link>
  );
}
