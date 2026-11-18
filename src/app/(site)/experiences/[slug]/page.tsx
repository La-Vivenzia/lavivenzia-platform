import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles, UtensilsCrossed } from "lucide-react";
import { GoldRule } from "@/components/ui/wordmark";
import { BookingPanel } from "@/components/site/booking-panel";
import { LiveTrackButton } from "@/components/site/live-track-button";
import { LocationPanel } from "@/components/site/location-panel";
import { getPrincipal } from "@/lib/auth-context";
import { getCheckoutService, getDiscoveryService } from "@/lib/container";
import { getLogger } from "@/lib/logger";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { formatDuration, formatGuestRange, formatMoneyMinor } from "@/lib/format";
import { slugify } from "@/modules/experiences/slug";
import type { ExperienceDetail } from "@/modules/discovery/ports";
import type { CheckoutMode } from "@/modules/booking/contract";
import { CURATION_TRACK_LABELS } from "@/modules/discovery/curation";

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

  const principal = await getPrincipal();

  const cover = experience.images[0];
  const gallery = experience.images.slice(1);
  const price = formatMoneyMinor(experience.basePriceMinor, experience.currency);
  const place = [experience.city, experience.region, experience.country].filter(Boolean).join(", ");
  const hasCurationContent =
    !!experience.curation &&
    (experience.curation.curatorSecret.trim() !== "" ||
      experience.curation.vipPerks.length > 0 ||
      Boolean(experience.curation.curatedPairing?.trim()));

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
        <div className="relative aspect-[16/10] w-full overflow-hidden sm:aspect-[21/9] lg:aspect-[2.35/1]">
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
                "linear-gradient(to top, rgba(13,22,17,0.94) 0%, rgba(13,22,17,0.45) 50%, rgba(13,22,17,0.08) 100%)",
            }}
          />
        </div>

        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto w-full max-w-[1240px] px-5 pb-8 sm:px-8 sm:pb-12 lg:px-12">
            <nav aria-label="Breadcrumb" className="mb-3.5">
              <ol className="text-text-inverse-muted flex flex-wrap gap-2 text-[11px] tracking-[0.16em] uppercase">
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

            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                {experience.categoryName ? (
                  <span className="text-accent-ink dark:text-accent text-[10.5px] font-medium tracking-[0.24em] uppercase">
                    {experience.categoryName}
                  </span>
                ) : null}
                {experience.categoryName && experience.curation ? (
                  <span className="text-white/40" aria-hidden="true">
                    ·
                  </span>
                ) : null}
                {experience.curation ? (
                  <span className="rounded-pill border border-white/20 bg-white/10 px-2.5 py-0.5 text-[10px] font-medium tracking-[0.16em] uppercase text-text-inverse backdrop-blur-md dark:bg-black/40">
                    {CURATION_TRACK_LABELS[experience.curation.curationTrack] ??
                      experience.curation.curationTrack}
                  </span>
                ) : null}
              </div>
              <h1 className="font-display max-w-3xl text-[30px] leading-[1.15] tracking-tight sm:text-[40px] lg:text-[46px]">
                {experience.title}
              </h1>
              {place ? (
                <p className="text-text-inverse-muted text-[12.5px] font-light tracking-[0.14em] uppercase sm:text-[13px]">
                  {place}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1240px] px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-16">
        <div className="flex flex-col gap-12 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-14 xl:gap-20">
          {/* ── The story ─────────────────────────────────────────── */}
          <div className="flex min-w-0 flex-col gap-10 sm:gap-12">
            {experience.summary ? (
              <p className="font-display text-heading max-w-2xl text-[20px] font-normal leading-[1.55] sm:text-[23px]">
                {experience.summary}
              </p>
            ) : null}

            {hasCurationContent && experience.curation ? (
              <section className="border-line bg-surface rounded-card shadow-card flex flex-col gap-5 border p-6 sm:p-7">
                <div className="flex flex-col gap-2.5">
                  <span className="eyebrow text-accent-ink flex items-center gap-1.5">
                    <Sparkles
                      className="h-3.5 w-3.5 shrink-0 text-accent-ink"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                    Curator’s Perspective
                  </span>
                  {experience.curation.curatorSecret?.trim() ? (
                    <p className="font-display text-heading text-[16px] font-normal leading-relaxed italic sm:text-[17px]">
                      “{experience.curation.curatorSecret}”
                    </p>
                  ) : null}
                </div>

                {experience.curation.vipPerks.length > 0 ? (
                  <div className="border-line flex flex-col gap-3 border-t pt-4">
                    <span className="eyebrow text-accent-ink">Exclusive Member Perks</span>
                    <ul className="grid gap-2.5 sm:grid-cols-2">
                      {experience.curation.vipPerks.map((perk) => (
                        <li
                          key={perk}
                          className="flex items-start gap-2.5 text-[13.5px] font-light text-fg leading-relaxed"
                        >
                          <span
                            aria-hidden="true"
                            className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                          />
                          <span>{perk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {experience.curation.curatedPairing?.trim() ? (
                  <div className="border-line flex items-center gap-2 border-t pt-4 text-[13px] text-fg-muted">
                    <UtensilsCrossed
                      className="h-3.5 w-3.5 shrink-0 text-accent-ink"
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                    <span className="font-light">
                      Signature Pairing:{" "}
                      <strong className="text-heading font-medium">
                        {experience.curation.curatedPairing}
                      </strong>
                    </span>
                  </div>
                ) : null}
              </section>
            ) : null}

            <GoldRule />

            {experience.description ? (
              <p className="text-fg max-w-2xl text-[15px] font-light leading-[1.8] whitespace-pre-line">
                {experience.description}
              </p>
            ) : null}

            {experience.inclusions.length > 0 || experience.exclusions.length > 0 ? (
              <section className="border-line grid gap-8 border-t pt-8 sm:grid-cols-2">
                <List title="What is included" items={experience.inclusions} />
                <List title="Not included" items={experience.exclusions} muted />
              </section>
            ) : null}

            {experience.guestNotes ? (
              <section className="border-line flex flex-col gap-2.5 border-t pt-8">
                <span className="eyebrow text-accent-ink">Good to know</span>
                <p className="text-fg-muted max-w-2xl text-[14px] font-light leading-relaxed whitespace-pre-line">
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
              <section className="border-line flex flex-col gap-4 border-t pt-8 sm:pt-10">
                <span className="eyebrow text-accent-ink">Gallery</span>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {gallery.map((image) => (
                    <div
                      key={image.id}
                      className="group relative aspect-[4/3] overflow-hidden rounded-card border border-line bg-surface-2 shadow-card"
                    >
                      <Image
                        src={image.url}
                        alt={image.altText ?? ""}
                        fill
                        sizes="(min-width: 640px) 240px, 45vw"
                        className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                      />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* ── Host ──────────────────────────────────────────────── */}
            <section className="border-line flex flex-col gap-3.5 border-t pt-8 sm:pt-10">
              <span className="eyebrow text-accent-ink">Your host</span>
              <div className="flex flex-wrap items-baseline gap-3">
                <h2 className="font-display text-heading text-[22px] font-normal">
                  {experience.host.displayName}
                </h2>
                {experience.host.isVerified ? (
                  <span className="inline-flex items-center gap-1 rounded-pill border border-success/30 bg-success/10 px-2.5 py-0.5 text-[10px] font-medium tracking-[0.12em] uppercase text-success">
                    Verified
                  </span>
                ) : null}
              </div>
              {experience.host.headline ? (
                <p className="text-fg text-[14.5px] font-light leading-relaxed">
                  {experience.host.headline}
                </p>
              ) : null}
              {experience.host.about ? (
                <p className="text-fg-muted max-w-2xl text-[13.5px] font-light leading-relaxed whitespace-pre-line sm:text-[14px]">
                  {experience.host.about}
                </p>
              ) : null}
            </section>
          </div>

          {/* ── Booking panel ─────────────────────────────────────── */}
          <aside className="lg:sticky lg:top-[106px]">
            <div className="border-line bg-surface rounded-card shadow-card flex flex-col gap-6 border p-6 sm:p-7">
              <div className="flex flex-col gap-1">
                <span className="eyebrow text-accent-ink">From</span>
                <span className="font-display text-heading text-[32px] leading-none sm:text-[36px]">
                  {price ?? "On request"}
                </span>
                {price ? (
                  <span className="text-fg-subtle text-[12px] font-light">
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
                {experience.curation?.timeSavedMinutes ? (
                  <Row label="Time saved" value={`~${experience.curation.timeSavedMinutes} mins`} />
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
                  signedIn={principal !== null}
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
      <dt className="text-fg-muted font-light">{label}</dt>
      <dd className="text-heading text-right font-medium">{value}</dd>
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
      <span className="eyebrow text-accent-ink">{title}</span>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item}
            className={`flex items-baseline gap-3 text-[14px] font-light ${muted ? "text-fg-subtle" : "text-fg-muted"}`}
          >
            <span
              aria-hidden="true"
              className={`mt-2 h-px w-2.5 shrink-0 ${muted ? "bg-line-strong" : "bg-accent"}`}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
