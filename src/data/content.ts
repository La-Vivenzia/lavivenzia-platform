/**
 * All demo copy and imagery in one place. Every image lives in /public/images,
 * so the demo has no runtime dependency on any external service.
 */

export type Destination = {
  id: string;
  name: string;
  country: string;
  badge: string;
  image: string;
  alt: string;
  /** Focal point for the crop, tuned per photograph. */
  focus?: string;
};

export const brand = {
  name: "La Vivenzia",
  tagline: "Experience Every Journey Through Its Soul",
  eyebrow: "Experiences Beyond Destinations",
  headline: ["Journeys", "Designed", "Around You."],
  supporting: "Curated stays, unique experiences and intelligent planning — all in one place.",
  searchPlaceholder: "Where would you like to go?",
} as const;

export const heroImage = {
  src: "/images/hero-positano.jpg",
  alt: "The cliffside town of Positano on the Amalfi Coast at golden hour, terracotta houses stacked above a calm sea.",
  place: "Positano, Italy",
  caption: "A Different Perspective",
};

/**
 * `target` is a bare section key, not an href. The mobile and desktop layouts
 * are both in the DOM (one is display:none), so each prefixes these keys with
 * its own namespace — otherwise the anchors would resolve to the hidden tree
 * and scrolling would silently do nothing.
 */
export const quickAccess = [
  { id: "stays", label: "Stays", icon: "bed", target: "curated" },
  { id: "experiences", label: "Experiences", icon: "compass", target: "experiences" },
  { id: "genie", label: "AI Genie", icon: "genie", target: "genie" },
  { id: "destinations", label: "Destinations", icon: "pin", target: "popular" },
] as const;

export const curated: Destination[] = [
  {
    id: "amalfi",
    name: "Amalfi Coast",
    country: "Italy",
    badge: "Featured",
    image: "/images/amalfi-coast.jpg",
    alt: "Pastel houses of the Amalfi Coast glowing at dusk above the Tyrrhenian Sea.",
    focus: "50% 55%",
  },
  {
    id: "kyoto",
    name: "Kyoto",
    country: "Japan",
    badge: "Culture",
    image: "/images/kyoto.jpg",
    alt: "A traditional Japanese pagoda framed by cherry blossom at sunset in Kyoto.",
    focus: "50% 45%",
  },
  {
    id: "rajasthan",
    name: "Rajasthan",
    country: "India",
    badge: "Unique Stays",
    image: "/images/rajasthan.jpg",
    alt: "An open-air desert suite with a canopied bed looking out over dunes at sunrise.",
    focus: "60% 50%",
  },
  {
    id: "bali",
    name: "Bali",
    country: "Indonesia",
    badge: "Beaches",
    image: "/images/bali.jpg",
    alt: "Terraced emerald rice paddies edged with palms in Tegalalang, Bali.",
    focus: "50% 50%",
  },
];

export const popular: Destination[] = [
  {
    id: "alps",
    name: "Swiss Alps",
    country: "Switzerland",
    badge: "Mountains",
    image: "/images/swiss-alps.jpg",
    alt: "Golden light breaking across rugged snow-covered Alpine peaks at sunset.",
    focus: "50% 45%",
  },
  {
    id: "maldives",
    name: "Maldives",
    country: "Indian Ocean",
    badge: "Islands",
    image: "/images/maldives.jpg",
    alt: "A palm-shaded beach pavilion looking out across turquoise shallows.",
    focus: "50% 50%",
  },
  {
    id: "santorini",
    name: "Santorini",
    country: "Greece",
    badge: "Coastal",
    image: "/images/santorini.jpg",
    alt: "Whitewashed village houses stepping down a caldera cliff above the Aegean.",
    focus: "50% 50%",
  },
  {
    id: "marrakech",
    name: "Marrakech",
    country: "Morocco",
    badge: "Heritage",
    image: "/images/marrakech.jpg",
    alt: "An ornate riad courtyard with carved arches reflected in a still pool.",
    focus: "50% 50%",
  },
  {
    id: "serengeti",
    name: "Serengeti",
    country: "Tanzania",
    badge: "Wildlife",
    image: "/images/serengeti.jpg",
    alt: "A giraffe moving through pale savanna grass beneath flat-topped acacias.",
    focus: "50% 62%",
  },
  {
    id: "cappadocia",
    name: "Cappadocia",
    country: "Türkiye",
    badge: "Iconic",
    image: "/images/cappadocia.jpg",
    alt: "Hot air balloons drifting over a mist-filled Cappadocian valley at dawn.",
    focus: "50% 45%",
  },
];

export type Experience = {
  id: string;
  title: string;
  place: string;
  duration: string;
  image: string;
  alt: string;
  description: string;
  focus?: string;
};

export const experiences: Experience[] = [
  {
    id: "villa",
    title: "A Private Terrace Above the Bay",
    place: "Amalfi Coast, Italy",
    duration: "3 nights",
    image: "/images/amalfi-villa.jpg",
    alt: "An infinity pool on a stone terrace overlooking a deep blue Mediterranean bay.",
    description:
      "A cliff-edge villa opened for six guests, with a chef who cooks whatever the morning market offered.",
    focus: "68% 55%",
  },
  {
    id: "dawn",
    title: "Balloons Before the Valley Wakes",
    place: "Cappadocia, Türkiye",
    duration: "Half day",
    image: "/images/cappadocia.jpg",
    alt: "Balloons hanging over a mist-filled valley in the first light of morning.",
    description:
      "Lift off at first light with a pilot who has flown these valleys for twenty-two years.",
    focus: "50% 45%",
  },
  {
    id: "migration",
    title: "Following the Herds at Dusk",
    place: "Serengeti, Tanzania",
    duration: "5 nights",
    image: "/images/serengeti.jpg",
    alt: "Acacia woodland and dry grass on the open savanna in soft morning light.",
    description:
      "A mobile camp that moves with the migration, guided by trackers born on this plain.",
    focus: "55% 60%",
  },
];

export const genie = {
  sectionTitle: "Plan Smarter with AI Genie",
  action: "Try Now",
  headline: ["Tell us what you love,", "we'll craft your perfect journey."],
  supporting: "Personalized itineraries, stays and experiences in seconds.",
  prompts: [
    "Ten quiet days in Japan, mostly walking",
    "A coastline in Italy, no crowds, late September",
    "Somewhere warm where my kids can learn to dive",
  ],
  highlights: [
    {
      title: "Reads the whole brief",
      body: "Pace, budget, who you're travelling with, what you'd rather avoid.",
    },
    {
      title: "Builds a real itinerary",
      body: "Stays, routes and timings that hold together day to day.",
    },
    {
      title: "Keeps adjusting",
      body: "Change one thing and the rest of the journey rearranges around it.",
    },
  ],
};

/**
 * Desktop navigation.
 *
 * Real routes, not in-page anchors. "Stays", "AI Genie" and "Journal" are gone:
 * there is no accommodation entity, AI planning is a later phase, and there is
 * no editorial content — a nav item that scrolls to invented copy is worse than
 * one fewer nav item.
 */
export const desktopNav = [
  { label: "Experiences", href: "/experiences" },
  { label: "Destinations", href: "/destinations" },
  { label: "Collections", href: "/categories" },
  { label: "Host with us", href: "/become-a-host" },
];

export const bottomNav = [
  { id: "home", label: "Home", icon: "home" },
  { id: "explore", label: "Explore", icon: "compass" },
  { id: "trips", label: "Trips", icon: "calendar" },
  { id: "profile", label: "Profile", icon: "user" },
] as const;

export const pillars = [
  {
    title: "Curated Stays",
    body: "Handpicked places that blend genuine luxury with a sense of where you actually are.",
    icon: "pin",
  },
  {
    title: "Unique Experiences",
    body: "Local-led, small in number, and designed around the way you like to travel.",
    icon: "genie",
  },
  {
    title: "Personalized Planning",
    body: "AI-assisted itineraries, refined by people who know these places first-hand.",
    icon: "compass",
  },
];

export const journal = [
  {
    id: "shoulder",
    kicker: "Field Notes",
    title: "The Case for the Shoulder Season",
    body: "Why late September on the Amalfi Coast reads differently to August — and how to plan for it.",
    read: "6 min read",
  },
  {
    id: "kyoto",
    kicker: "Guide",
    title: "Kyoto, Away From the Queue",
    body: "Twelve temples, gardens and tea houses that stay quiet even in blossom season.",
    read: "9 min read",
  },
  {
    id: "desert",
    kicker: "Interview",
    title: "The People Who Build Desert Camps",
    body: "A conversation about water, wind and what it takes to put a bed in the middle of nowhere.",
    read: "11 min read",
  },
];

export const user = {
  initials: "KP",
  name: "Karan Patil",
  membership: "Atelier Member",
};
