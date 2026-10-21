import type { Destination as CardDestination, Experience as CardExperience } from "@/data/content";
import type { CategorySummary, Destination, ExperienceSummary } from "@/modules/discovery/ports";
import { formatDuration, formatGuestRange } from "@/lib/format";

/**
 * Adapters from the domain to the approved home-screen components.
 *
 * The components were ported from the approved demo and their prop shapes came
 * with them. Rather than rewrite ~26 components to speak the domain's language
 * — which would risk the visual fidelity the port exists to preserve — the
 * translation happens here, once.
 *
 * That is the whole trick of this file: **the pixels stay exactly as approved
 * while the content becomes real.** The demo's arrays were a fixture; these are
 * the published catalogue.
 *
 * Every listing keeps its slug so the card can link to the real page. The demo
 * cards linked to `#` because there was nowhere to go.
 */

/** The hero photograph — a real published listing, when one has a photo. */
export interface HeroImage {
  readonly src: string;
  readonly alt: string;
  readonly place: string;
  readonly caption: string;
}

/** A card the traveller can actually open. */
export interface LinkedDestination extends CardDestination {
  readonly href: string;
}

export interface LinkedExperience extends CardExperience {
  readonly href: string;
}

/**
 * A published listing, as a destination-shaped card.
 *
 * The rails in the reference show *places*; the catalogue stores *experiences*.
 * A listing carries its city, so it renders in that shape without inventing
 * anything — the name is the place, the badge is the category the host chose.
 */
export function toDestinationCard(experience: ExperienceSummary): LinkedDestination | null {
  // No photograph means no card. The approved design is photography-led, and a
  // grey rectangle in a rail of images reads as a broken asset.
  if (!experience.coverUrl) return null;

  return {
    id: experience.id,
    name: experience.city ?? experience.title,
    country: [experience.region, experience.country].filter(Boolean).join(", "),
    badge: experience.categoryName ?? "Experience",
    image: experience.coverUrl,
    // The host's own alt text. Empty rather than invented when absent, so a
    // screen reader skips the image instead of hearing a filename.
    alt: experience.coverAlt ?? "",
    href: `/experiences/${experience.slug}`,
  };
}

/** A published listing, as an experience-shaped card. */
export function toExperienceCard(experience: ExperienceSummary): LinkedExperience | null {
  if (!experience.coverUrl) return null;

  const place = [experience.city, experience.region].filter(Boolean).join(", ");

  return {
    id: experience.id,
    title: experience.title,
    place: place || experience.country,
    // Duration where the host gave one, otherwise the party size — the card has
    // one line for this and an empty line looks like a rendering fault.
    duration:
      formatDuration(experience.durationMinutes) ??
      formatGuestRange(experience.minGuests, experience.maxGuests),
    image: experience.coverUrl,
    alt: experience.coverAlt ?? "",
    description: experience.summary ?? "",
    href: `/experiences/${experience.slug}`,
  };
}

/** A derived destination, as a card. */
export function destinationToCard(destination: Destination): LinkedDestination | null {
  if (!destination.coverUrl) return null;

  return {
    id: destination.slug,
    name: destination.city,
    country: [destination.region, destination.country].filter(Boolean).join(", "),
    badge: `${destination.experienceCount} ${
      destination.experienceCount === 1 ? "experience" : "experiences"
    }`,
    image: destination.coverUrl,
    alt: `${destination.city}, ${destination.country}`,
    href: `/destinations/${destination.slug}`,
  };
}

/**
 * The four circular shortcuts.
 *
 * The reference labels them Stays · Experiences · AI Genie · Destinations. Two
 * of those have nothing behind them — there is no accommodation entity, and AI
 * planning is a later phase — so the shape is kept exactly and the destinations
 * point at routes that exist. Four taps into a 404 would be a worse betrayal of
 * the design than a different word.
 *
 * The fourth slot is a real category when one is published, because that is the
 * closest honest equivalent to a themed shortcut.
 */
/** One circular shortcut, with a destination that exists. */
export interface QuickAccessItem {
  readonly id: string;
  readonly label: string;
  readonly icon: "bed" | "compass" | "genie" | "pin";
  readonly href: string;
}

export function toQuickAccess(categories: readonly CategorySummary[]): readonly QuickAccessItem[] {
  const topCategory = categories[0];

  return [
    { id: "experiences", label: "Experiences", icon: "compass" as const, href: "/experiences" },
    { id: "destinations", label: "Destinations", icon: "pin" as const, href: "/destinations" },
    { id: "collections", label: "Collections", icon: "genie" as const, href: "/categories" },
    topCategory
      ? {
          id: topCategory.key,
          label: topCategory.name,
          icon: "bed" as const,
          href: `/categories/${encodeURIComponent(topCategory.key)}`,
        }
      : { id: "host", label: "Host with us", icon: "bed" as const, href: "/become-a-host" },
  ];
}

/** Initials for the header avatar, from the signed-in address. */
export function initialsFor(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase();
  }

  return local.slice(0, 2).toUpperCase() || "·";
}

/**
 * The hero photograph.
 *
 * The newest published listing that actually has one. The brand's Positano
 * image is the fallback, not the default: it is a stock photograph of a place
 * La Vivenzia does not sell, so a real listing outranks it whenever one exists.
 */
export function toHeroImage(experiences: readonly ExperienceSummary[]): HeroImage {
  const withPhoto = experiences.find((experience) => experience.coverUrl !== null);

  if (!withPhoto?.coverUrl) {
    return {
      src: "/images/hero-positano.jpg",
      alt: "The cliffside town of Positano at golden hour, terracotta houses stacked above a calm sea.",
      place: "La Vivenzia",
      caption: "Experiences beyond destinations",
    };
  }

  return {
    src: withPhoto.coverUrl,
    alt: withPhoto.coverAlt ?? "",
    place: [withPhoto.city, withPhoto.region].filter(Boolean).join(", ") || withPhoto.title,
    caption: withPhoto.categoryName ?? "A different perspective",
  };
}
