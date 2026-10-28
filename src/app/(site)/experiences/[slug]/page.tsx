import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GoldRule } from "@/components/ui/wordmark";
import { BookingPanel } from "@/components/site/booking-panel";
import { LiveTrackButton } from "@/components/site/live-track-button";
import { LocationPanel } from "@/components/site/location-panel";
import { getCheckoutService, getDiscoveryService } from "@/lib/container";
import { getLogger } from "@/lib/logger";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { formatDuration, formatGuestRange, formatMoneyMinor } from "@/lib/format";
import { slugify } from "@/modules/experiences/slug";
import type { ExperienceDetail } from "@/modules/discovery/ports";
import type { CheckoutMode } from "@/modules/booking/contract";

/**
 * The experience detail page (FR-01).
 *
 * The booking panel is a real column — price, duration, capacity, host — with
 * the interactive `BookingPanel` (FR-09) beneath the facts. How its reserve
 * action completes (off, demo or Razorpay test mode) is server configuration,
 * resolved here and passed down as data (ADR-0016).
 */

/**
 * The checkout mode, without letting booking configuration take the page down.
 *
 * A misconfigured checkout (say, live Razorpay keys) is refused by the service.
 * On the page that refusal degrades to "off" — the listing still renders, the
 * reserve action stays closed — and the error is logged for whoever deployed it.
 */
function checkoutMode(): CheckoutMode {
  try {
    return getCheckoutService().mode;
  } catch (error) {
    getLogger().error({ err: error }, "booking checkout is misconfigured; reserve is closed");
    return "off";
  }
}

/**
 * Structured data for the listing.
 *
 * `schema.org/TouristAttraction` rather than `Product`: this is an experience
 * with a place and a host, not an item of stock, and the wrong type produces the
 * wrong rich result.
 *
 * **Only facts the catalogue actually holds are emitted.** No rating, no review
 * count, no availability date — none exist yet, and inventing them to earn a
 * star rating in a search result is exactly what gets a domain penalised. Price
 * appears only when the host set one.
 */
function structuredData(experience: ExperienceDetail) {
  const locality = [experience.city, experience.region, experience.country]
    .filter(Boolean)
    .join(", ");

  return {
    "@context": "https://schema.org",
    "@type": "TouristAttraction",
    name: experience.title,
    ...(experience.summary ? { description: experience.summary } : {}),
    ...(experience.coverUrl ? { image: experience.coverUrl } : {}),
    ...(locality ? { address: { "@type": "PostalAddress", addressLocality: locality } } : {}),
    ...(experience.latitude !== null && experience.longitude !== null
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: experience.latitude,
            longitude: experience.longitude,
          },
        }
      : {}),
    ...(experience.basePriceMinor !== null
      ? {
          offers: {
            "@type": "Offer",
            price: (experience.basePriceMinor / 100).toFixed(2),
            priceCurrency: experience.currency,
            availability: "https://schema.org/PreOrder",
          },
        }
      : {}),
  };
}

/**
 * Load the listing, once per request.
 *
 * `cache` deduplicates the call: `generateMetadata` and the page component both
 * need the listing, and without this each render costs two identical queries.
 */
const load = cache(async (slug: string): Promise<ExperienceDetail | null> => {
  try {
    return await getDiscoveryService().getExperience(slug);
  } catch (error) {
    // A malformed slug and an unpublished listing are the same answer to a
    // stranger: not found. Anything else lets the URL be used to probe the
    // review queue.
    if (error instanceof NotFoundError || error instanceof ValidationError) return null;
    throw error;
  }
});

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const experience = await load(slug);

  // `notFound()` here rather than in the page body, and the distinction is not
  // cosmetic. Metadata resolves before the response starts streaming; throwing
  // it later cannot change a status that has already been sent, which produced
  // a "soft 404" — the right page rendered under HTTP 200, exactly what a
  // search engine would index.
  if (!experience) notFound();

  // Real metadata rather than a placeholder: REQUIREMENTS.md asks for
  // indexable experience pages and social sharing metadata.
  const description = experience.summary ?? experience.description?.slice(0, 160) ?? undefined;

  return {
    title: experience.title,
    ...(description ? { description } : {}),
    // Canonical, because the same listing is reachable from a destination, a
    // collection and a search result. Without it those are three URLs competing
    // for the same page in an index.
    alternates: { canonical: `/experiences/${experience.slug}` },
    openGraph: {
      title: experience.title,
      ...(description ? { description } : {}),
      type: "website",
      ...(experience.coverUrl ? { images: [{ url: experience.coverUrl }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: experience.title,
      ...(description ? { description } : {}),
      ...(experience.coverUrl ? { images: [experience.coverUrl] } : {}),
    },
  };
}

export default async function ExperienceDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}) {
  const { slug } = await params;
  const experience = await load(slug);
  if (!experience) notFound();

  const cover = experience.images[0];
  const gallery = experience.images.slice(1);
  const price = formatMoneyMinor(experience.basePriceMinor, experience.currency);
  const place = [experience.city, experience.region, experience.country].filter(Boolean).join(", ");

  return (
    <main>
      {/*
       * Structured data. `JSON.stringify` of an object we built, never of user
       * text spliced into a template, so a title containing `</script>` cannot
       * break out of the block.
       */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData(experience)),
        }}
      />

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <header className="bg-ink text-text-inverse relative isolate">
        <div className="relative aspect-[16/10] w-full overflow-hidden sm:aspect-[21/9]">
          {cover ? (
            <Image
              src={cover.url}
              alt={cover.altText ?? ""}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          ) : (
            <div className="bg-charcoal absolute inset-0" />
          )}
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(23,20,15,0.94) 0%, rgba(23,20,15,0.4) 50%, rgba(23,20,15,0.1) 100%)",
            }}
          />
        </div>

        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto w-full max-w-[1200px] px-6 pb-10 sm:px-10 sm:pb-14">
            <nav aria-label="Breadcrumb" className="mb-4">
              <ol className="text-text-inverse-muted flex flex-wrap gap-2 text-[11px] tracking-[0.14em] uppercase">
                <li>
                  <Link href="/experiences" className="hover:text-gold-light transition-colors">
                    Experiences
                  </Link>
                </li>
                {experience.city ? (
                  <>
                    <li aria-hidden="true">·</li>
                    <li>
                      <Link
                        href={`/destinations/${slugify(experience.city)}`}
                        className="hover:text-gold-light transition-colors"
                      >
                        {experience.city}
                      </Link>
                    </li>
                  </>
                ) : null}
              </ol>
            </nav>

            <div className="flex flex-col gap-3">
              {experience.categoryName ? (
                <span className="text-gold-light text-[10px] tracking-[0.24em] uppercase">
                  {experience.categoryName}
                </span>
              ) : null}
              <h1 className="font-display max-w-3xl text-[28px] leading-[1.2] sm:text-[42px]">
                {experience.title}
              </h1>
              {place ? (
                <p className="text-text-inverse-muted text-[13px] tracking-[0.12em] uppercase">
                  {place}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1200px] px-6 py-14 sm:px-10 lg:py-20">
        <div className="flex flex-col gap-14 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-20">
          {/* ── The story ─────────────────────────────────────────── */}
          <div className="flex min-w-0 flex-col gap-12">
            {experience.summary ? (
              <p className="font-display text-text max-w-2xl text-[19px] leading-[1.6] sm:text-[22px]">
                {experience.summary}
              </p>
            ) : null}

            <GoldRule />

            {experience.description ? (
              <p className="text-text max-w-2xl text-[15px] leading-[1.85] whitespace-pre-line">
                {experience.description}
              </p>
            ) : null}

            {experience.inclusions.length > 0 || experience.exclusions.length > 0 ? (
              <section className="border-line grid gap-10 border-t pt-10 sm:grid-cols-2">
                <List title="What is included" items={experience.inclusions} />
                <List title="Not included" items={experience.exclusions} muted />
              </section>
            ) : null}

            {experience.guestNotes ? (
              <section className="border-line flex flex-col gap-3 border-t pt-10">
                <span className="eyebrow">Good to know</span>
                <p className="text-text-muted max-w-2xl text-[14px] leading-relaxed whitespace-pre-line">
                  {experience.guestNotes}
                </p>
              </section>
            ) : null}

            <LocationPanel
              addressLine={experience.addressLine}
              city={experience.city}
              region={experience.region}
              country={experience.country}
              postalCode={experience.postalCode}
              latitude={experience.latitude}
              longitude={experience.longitude}
              title={experience.title}
              slug={experience.slug}
            />

            {gallery.length > 0 ? (
              <section className="border-line flex flex-col gap-5 border-t pt-10">
                <span className="eyebrow">Gallery</span>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {gallery.map((image) => (
                    <div
                      key={image.id}
                      className="bg-surface-sunken relative aspect-[4/3] overflow-hidden"
                    >
                      <Image
                        src={image.url}
                        alt={image.altText ?? ""}
                        fill
                        sizes="(min-width: 640px) 240px, 45vw"
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* ── Host ──────────────────────────────────────────────── */}
            <section className="border-line flex flex-col gap-4 border-t pt-10">
              <span className="eyebrow">Your host</span>
              <div className="flex flex-wrap items-baseline gap-3">
                <h2 className="font-display text-text text-[20px]">
                  {experience.host.displayName}
                </h2>
                {experience.host.isVerified ? (
                  <span className="border-success/25 bg-success-wash text-success rounded-xs border px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] uppercase">
                    Verified
                  </span>
                ) : null}
              </div>
              {experience.host.headline ? (
                <p className="text-text text-[15px] leading-relaxed">{experience.host.headline}</p>
              ) : null}
              {experience.host.about ? (
                <p className="text-text-muted max-w-2xl text-[14px] leading-relaxed whitespace-pre-line">
                  {experience.host.about}
                </p>
              ) : null}
            </section>

            {/* ── Where ─────────────────────────────────────────────── */}
            <section className="border-line flex flex-col gap-3 border-t pt-10">
              <span className="eyebrow">Where</span>
              <p className="text-text text-[15px]">{place || "Location on request"}</p>
              <p className="text-text-subtle text-[12px]">
                {/* The venue is restated on the confirmation, after booking. */}
                The venue and directions are on your booking confirmation.
              </p>
            </section>
          </div>

          {/* ── Booking panel ─────────────────────────────────────── */}
          <aside className="lg:sticky lg:top-24">
            <div className="border-line bg-surface flex flex-col gap-6 border p-7">
              <div className="flex flex-col gap-1">
                <span className="eyebrow">From</span>
                <span className="font-display text-text text-[30px] leading-none">
                  {price ?? "On request"}
                </span>
                {price ? (
                  <span className="text-text-subtle text-[12px]">
                    {experience.pricingUnit === "PER_PERSON" ? "per person" : "per group"}
                  </span>
                ) : null}
              </div>

              <dl className="border-line flex flex-col gap-3 border-t pt-5 text-[13px]">
                <Row label="Duration" value={formatDuration(experience.durationMinutes) ?? "—"} />
                <Row
                  label="Guests"
                  value={formatGuestRange(experience.minGuests, experience.maxGuests)}
                />
                <Row label="Hosted by" value={experience.host.displayName} />
                {experience.languages.length > 0 ? (
                  <Row label="Languages" value={experience.languages.join(", ").toUpperCase()} />
                ) : null}
              </dl>

              {experience.latitude !== null && experience.longitude !== null ? (
                <LiveTrackButton
                  slug={experience.slug}
                  title={experience.title}
                  latitude={experience.latitude}
                  longitude={experience.longitude}
                  fullWidth
                />
              ) : null}

              <div className="border-line border-t pt-6">
                <BookingPanel
                  slug={experience.slug}
                  title={experience.title}
                  basePriceMinor={experience.basePriceMinor}
                  currency={experience.currency}
                  pricingUnit={experience.pricingUnit}
                  minGuests={experience.minGuests}
                  maxGuests={experience.maxGuests}
                  checkoutMode={checkoutMode()}
                />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-text-subtle">{label}</dt>
      <dd className="text-text text-right">{value}</dd>
    </div>
  );
}

function List({
  title,
  items,
  muted = false,
}: {
  readonly title: string;
  readonly items: readonly string[];
  readonly muted?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <span className="eyebrow">{title}</span>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item}
            className={`flex items-baseline gap-3 text-[14px] ${muted ? "text-text-subtle" : "text-text-muted"}`}
          >
            <span
              aria-hidden="true"
              className={`mt-2 h-px w-3 shrink-0 ${muted ? "bg-line-strong" : "bg-gold"}`}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
