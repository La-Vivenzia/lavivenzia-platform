/**
 * The Pune pilot catalogue (Amanora, Seasons Mall, Magarpatta, Hadapsar, Viman Nagar).
 *
 * One definition, two readers. `scripts/seed-pune-pilot.ts` writes it into
 * PostgreSQL, which is where travellers and the copilot normally read it from.
 * The discovery repository's offline fallback serves it directly when the
 * database is unreachable outside production — so a developer without a
 * running Postgres sees exactly what the seed would have published, and the two
 * cannot drift apart.
 */

import type { ExperienceCuration } from "@/modules/discovery/curation";

export const PILOT_HOST = {
  email: "pune.pilot.host@lavivenzia.com",
  displayName: "La Vivenzia Pune Curations",
  headline: "Official Pilot Curation Team for East Pune",
  about:
    "Handcrafted, verified local experiences and urban retreats across Amanora, Seasons Mall, and Magarpatta City.",
  city: "Pune",
  region: "Maharashtra",
  country: "IN",
} as const;

/** Every pilot listing is offered in these languages. */
export const PILOT_LANGUAGES: readonly string[] = ["en", "hi", "mr"];

export interface PilotExperienceInput {
  slug: string;
  title: string;
  summary: string;
  description: string;
  categoryKey: string;
  addressLine: string;
  city: string;
  region: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  durationMinutes: number;
  minGuests: number;
  maxGuests: number;
  basePriceMinor: number;
  pricingUnit: "PER_PERSON" | "PER_GROUP";
  inclusions: string[];
  exclusions: string[];
  guestNotes: string;
  /**
   * Editorial layer: perks, insider knowledge and the mood track. Not seeded
   * into PostgreSQL — the discovery repositories overlay it by slug (see
   * `pilotCurationFor`), so editing a perk needs no migration.
   */
  curation: ExperienceCuration;
  coverImageKey: string;
  altText: string;
}

export const PILOT_EXPERIENCES: readonly PilotExperienceInput[] = [
  // ── Gaming & Interactive Fun ──────────────────────────────────────────────
  {
    slug: "smaaash-vr-twilight-bowling-amanora",
    title: "Smaaash Arena: Twilight Bowling, VR Simulators & Craft Drinks",
    summary:
      "High-octane entertainment hub featuring UV twilight bowling lanes, cricket simulators, and immersive VR gaming.",
    description:
      "Step into Pune's premier urban gaming arena at Amanora Mall. Challenge friends to UV twilight bowling, test your batting against legendary international bowlers in the 360-degree cricket simulator, and dive into high-immersion VR rollercoasters and arcade classics. Refresh between games with finger foods, craft mocktails, and chilled beer.",
    categoryKey: "adventure",
    addressLine: "2nd Floor, East Block, Amanora Mall, Hadapsar",
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411028",
    latitude: 18.518012,
    longitude: 73.934521,
    durationMinutes: 120,
    minGuests: 1,
    maxGuests: 10,
    basePriceMinor: 89900,
    pricingUnit: "PER_PERSON",
    inclusions: [
      "2 Bowling games with shoe rental",
      "3 VR experience tokens",
      "₹300 arcade gaming card",
      "Welcome beverage",
    ],
    exclusions: ["Additional arcade credits", "Hard liquor"],
    guestNotes:
      "Socks mandatory for bowling shoe rental. Weekends experience peak footfall; reservations guarantee lane allocation.",
    curation: {
      curationTrack: "HIGH_OCTANE_NIGHTLIFE",
      vipPerks: [
        "Pre-assigned UV lane — no weekend lane queue at the counter",
        "VR tokens loaded before arrival, straight to the simulator bay",
        "Welcome craft pour or mocktail handed over at check-in",
      ],
      curatorSecret:
        "Book the 8:30 PM lane on a Friday: the UV lighting peaks after the dinner crowd clears, and lane 6 sits furthest from the arcade din.",
      timeSavedMinutes: 40,
      curatedPairing: "Chilled lager with peri-peri loaded fries between frames",
    },
    coverImageKey:
      "https://images.unsplash.com/photo-1538388149542-5e24932d11a8?auto=format&fit=crop&w=1600&q=80",
    altText: "Vibrant neon twilight bowling alley and arcade gaming lounge at Smaaash Amanora",
  },
  {
    slug: "mystery-rooms-escape-challenge-amanora",
    title: "Mystery Rooms: 60-Minute Real-Life Escape Room Odyssey",
    summary:
      "High-stakes escape room mission: decipher cryptograms, solve hidden mechanisms, and break out before the timer ends.",
    description:
      "An intense team puzzle adventure where you are locked in a meticulously designed themed room with one hour to escape. Choose between bomb defusal, haunted cabin mysteries, or high-security prison breaks. Every drawer, painting, and sound cue is a potential key.",
    categoryKey: "adventure",
    addressLine: "Amanora Town Centre, Opposite Central Courtyard, Hadapsar",
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411028",
    latitude: 18.517456,
    longitude: 73.933987,
    durationMinutes: 60,
    minGuests: 2,
    maxGuests: 8,
    basePriceMinor: 95000,
    pricingUnit: "PER_PERSON",
    inclusions: [
      "Full 60-minute escape room mission",
      "Dedicated game master briefing",
      "Team mission photograph",
      "Debriefing walkthrough",
    ],
    exclusions: ["Personal video recordings inside game chambers"],
    guestNotes:
      "Arrive 15 minutes prior for mission briefing. Suitable for groups of friends, corporate teams, and double dates.",
    curation: {
      curationTrack: "HIGH_OCTANE_NIGHTLIFE",
      vipPerks: [
        "Room locked to your group — no sharing with strangers",
        "Game master briefing held for you, no walk-in wait",
        "Mission photograph sent straight to your inbox",
      ],
      curatorSecret:
        "First-timers should take the Bomb Defusal room: its clue chain is linear and the finale is the most theatrical. Save the Haunted Cabin for a second visit.",
      timeSavedMinutes: 35,
    },
    coverImageKey:
      "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1600&q=80",
    altText:
      "Immersive escape room puzzle chamber with mysterious mechanisms at Mystery Rooms Amanora",
  },
  {
    slug: "timezone-laser-tag-seasons-mall",
    title: "Timezone Laser Tag Arena & High-Score Arcade Experience",
    summary:
      "Multi-level futuristic laser tag arena with UV obstacles, precision phasers, and top-tier Japanese arcade games.",
    description:
      "Located on the top entertainment floor of Seasons Mall, this arena blends state-of-the-art laser tag with an extensive redemption arcade. Suit up with wireless sensor vests and compete in an atmospheric sci-fi labyrinth.",
    categoryKey: "adventure",
    addressLine: "Level 3, Seasons Mall, Magarpatta City, Hadapsar",
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411028",
    latitude: 18.519782,
    longitude: 73.931215,
    durationMinutes: 90,
    minGuests: 2,
    maxGuests: 12,
    basePriceMinor: 69900,
    pricingUnit: "PER_PERSON",
    inclusions: [
      "2 Laser Tag battle rounds (15 mins each)",
      "Timezone Powercard preloaded with 80 game points",
      "Tactical sensor vest rental",
    ],
    exclusions: ["Merchandise counter prizes without tickets"],
    guestNotes: "Wear comfortable sneakers. Great for high-energy weekend battles.",
    curation: {
      curationTrack: "HIGH_OCTANE_NIGHTLIFE",
      vipPerks: [
        "Arena slot held for your group — skip the vest-up queue",
        "Powercard preloaded and waiting at the desk",
        "Back-to-back rounds booked, no re-queueing between battles",
      ],
      curatorSecret:
        "Take the upper ramp in round one — most teams rush the ground maze and the high ground scores double the tags.",
      timeSavedMinutes: 30,
    },
    coverImageKey:
      "https://images.unsplash.com/photo-1511882150382-421056c89033?auto=format&fit=crop&w=1600&q=80",
    altText:
      "Futuristic neon-lit laser tag arena and interactive arcade games at Timezone Seasons Mall",
  },

  // ── Breweries, Nightlife & Social Drinks ──────────────────────────────────
  {
    slug: "effingut-brewhouse-craft-tasting-seasons",
    title: "Effingut Brewhouse: Signature Craft Beer Flights & Gourmet Bites",
    summary:
      "Sample Pune's legendary craft microbrews — from cloudy Hefeweizens to bold Indian Pale Ales with paired gastropub bites.",
    description:
      "Effingut Seasons Mall is one of East Pune's most celebrated brewpubs. Settle into warm wooden interiors or the breezy terrace. Experience a curated flight of 5 distinct craft beers brewed from artisanal malt and fresh hops, guided by the brewmaster's notes on flavor profiles, bitterness units, and aroma pairings.",
    categoryKey: "culinary",
    addressLine: "Mezzanine Level, Seasons Mall, Magarpatta, Pune",
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411028",
    latitude: 18.519245,
    longitude: 73.931812,
    durationMinutes: 150,
    minGuests: 1,
    maxGuests: 8,
    basePriceMinor: 149900,
    pricingUnit: "PER_PERSON",
    inclusions: [
      "Tasting flight of 5 seasonal craft beers (150ml each)",
      "Signature bar platter (Crispy Calamari, Truffle Fries or Paneer Tikka)",
      "Dedicated table reservation",
    ],
    exclusions: ["Additional beer pints beyond flight", "Imported spirits"],
    guestNotes:
      "Legal drinking age required for alcoholic flights. Live music starts at 8:30 PM on Friday and Saturday.",
    curation: {
      curationTrack: "CONNOISSEUR",
      vipPerks: [
        "Guaranteed mezzanine corner table — zero weekend wait",
        "Complimentary seasonal craft taster pour on arrival",
        "Brewmaster tasting notes walked through at your table",
      ],
      curatorSecret:
        "Ask for the corner table by the mezzanine rail around 7:15 PM — you catch the last daylight over the terrace and settle in before the live set starts at 8:30.",
      timeSavedMinutes: 45,
      curatedPairing: "Cloudy Hefeweizen paired with crispy calamari and lemon aioli",
    },
    coverImageKey:
      "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1600&q=80",
    altText:
      "Freshly poured craft beer tasting flight and gourmet gastro bites at Effingut Brewhouse",
  },
  {
    slug: "the-beer-cafe-global-taps-amanora",
    title: "The Beer Café Oasis: Global Brews & Chilled Alfresco Evening",
    summary:
      "Explore 50+ international beer brands and fresh draught pours overlooking the illuminated Amanora Oasis fountain.",
    description:
      "Perched along the open-air waterside piazza of Amanora Town Centre, The Beer Café offers a relaxed, unhurried atmosphere. Ideal for catching up with friends or watching weekend Premier League matches on the giant outdoor projection.",
    categoryKey: "culinary",
    addressLine: "Ground Floor, Oasis Courtyard, Amanora Mall, Hadapsar",
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411028",
    latitude: 18.518491,
    longitude: 73.935012,
    durationMinutes: 120,
    minGuests: 2,
    maxGuests: 6,
    basePriceMinor: 119900,
    pricingUnit: "PER_PERSON",
    inclusions: [
      "2 Premium draught beer mugs or craft ciders",
      "Choice of thin crust pizza or loaded nachos",
      "Prime lakeside view seating",
    ],
    exclusions: ["Rare vintage bottled stouts"],
    guestNotes: "Outdoor seating is weather permitting; indoor AC section available.",
    curation: {
      curationTrack: "ALFRESCO_SUNDOWNER",
      vipPerks: [
        "Fountain-front alfresco table held for you",
        "First draught pour on the house",
        "Direct host seating — no waitlist at the piazza",
      ],
      curatorSecret:
        "The two tables nearest the Oasis fountain catch the evening breeze and the light show at dusk; arrive by 6:45 PM to watch the piazza come alive.",
      timeSavedMinutes: 30,
      curatedPairing: "Belgian witbier with orange peel alongside a classic nachos grande",
    },
    coverImageKey:
      "https://images.unsplash.com/photo-1535958636474-b021ee887b13?auto=format&fit=crop&w=1600&q=80",
    altText:
      "Chilled international draught beers on an open-air alfresco patio at The Beer Café Amanora",
  },
  {
    slug: "agent-jacks-interactive-bidding-bar",
    title: "Agent Jack's: Real-Time Drink Bidding & High-Energy Nightlife",
    summary:
      "Interactive bar where you bid for drinks on the app while DJ beats keep the dance floor humming.",
    description:
      "Experience the adrenaline of a virtual stock market where drink prices fluctuate with demand. Negotiate with 'Agent Jack' over an interactive app to score your favorite cocktails and craft brews at incredible deals.",
    categoryKey: "celebrations",
    addressLine: "Amanora Town Centre, Hadapsar, Pune",
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411028",
    latitude: 18.517882,
    longitude: 73.934189,
    durationMinutes: 180,
    minGuests: 2,
    maxGuests: 12,
    basePriceMinor: 139900,
    pricingUnit: "PER_PERSON",
    inclusions: [
      "₹1,200 food & beverage bidding credit",
      "Reserved VIP lounge table",
      "Entry for group without cover charges",
    ],
    exclusions: ["Additional orders exceeding credit"],
    guestNotes: "Clubwear dress code enforced on Friday and Saturday evenings.",
    curation: {
      curationTrack: "HIGH_OCTANE_NIGHTLIFE",
      vipPerks: [
        "Direct host entry pass — skip the Friday door line",
        "Reserved high-top beside the dance floor",
        "Complimentary first round of shots for the table",
      ],
      curatorSecret:
        "Prices on the drinks board dip when a round goes quiet — watch the screen around 10 PM, just before the DJ switches to the peak-hour set.",
      timeSavedMinutes: 50,
    },
    coverImageKey:
      "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?auto=format&fit=crop&w=1600&q=80",
    altText:
      "Dynamic neon-lit nightlife bar counter and craft cocktail mixology at Agent Jack's Amanora",
  },
  {
    slug: "indimex-urban-lounge-seasons",
    title: "Indimex Urban Lounge & Bar: Pocket-Friendly Pints & Gastropub Bites",
    summary:
      "Chilled draught beer and loaded gastropub plates inside Seasons Mall — an easy, budget-friendly round with friends.",
    description:
      "A relaxed urban lounge tucked inside Seasons Mall for when the plan is simply a cold beer and good company. Pull up at the bar or a high table, pour from the draught taps, and share crispy gastropub bites without stretching the budget.",
    categoryKey: "culinary",
    addressLine: "Seasons Mall, Magarpatta City, Hadapsar",
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411028",
    latitude: 18.51948,
    longitude: 73.93165,
    durationMinutes: 90,
    minGuests: 1,
    maxGuests: 10,
    basePriceMinor: 49900,
    pricingUnit: "PER_PERSON",
    inclusions: [
      "1 Draught beer pint or soft beverage",
      "Choice of gastropub bite (Masala Fries, Chilli Paneer or Chicken Wings)",
      "Reserved lounge seating",
    ],
    exclusions: ["Additional pints", "Premium spirits and cocktails"],
    guestNotes:
      "Legal drinking age required for alcoholic beverages; soft beverage served otherwise. Walk-in friendly; reservations hold a table at peak hours.",
    curation: {
      curationTrack: "ALFRESCO_SUNDOWNER",
      vipPerks: [
        "Peak-hour table held — no standing at the bar",
        "Welcome pitcher top-up for groups of four or more",
        "Quiet booth on request, away from the match screens",
      ],
      curatorSecret:
        "The window booths face the Magarpatta skyline and stay calm even on match nights; ask for them when you arrive.",
      timeSavedMinutes: 25,
      curatedPairing: "House lager with the masala peanut chaat and chicken ghee roast sliders",
    },
    coverImageKey:
      "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1600&q=80",
    altText:
      "Cozy urban lounge booths with craft burgers and chilled drinks at Indimex Seasons Mall",
  },

  // ── Artisanal Cafes, Workspaces & Slow Living ─────────────────────────────
  {
    slug: "third-wave-coffee-artisan-roastery-amanora",
    title: "Third Wave Coffee: Single-Origin Manual Brew Tasting & Slow Work",
    summary:
      "Specialty coffee session with master baristas, pour-over flights, and a peaceful work-friendly haven.",
    description:
      "Escape the city rush into a sanctuary of clean Scandinavian wood and freshly roasted Arabica aromas. Learn how extraction techniques — from Chemex to Aeropress — dramatically shift coffee notes from floral jasmine to rich dark chocolate.",
    categoryKey: "culinary",
    addressLine: "Ground Floor, West Block, Amanora Mall, Hadapsar",
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411028",
    latitude: 18.517621,
    longitude: 73.934608,
    durationMinutes: 90,
    minGuests: 1,
    maxGuests: 4,
    basePriceMinor: 45000,
    pricingUnit: "PER_PERSON",
    inclusions: [
      "Single-origin manual brew of your choice",
      "Fresh artisan croissant or sourdough bagel",
      "Dedicated workspace with high-speed Wi-Fi access",
    ],
    exclusions: ["Whole bean retail bags"],
    guestNotes: "Outlets available at every table. Quiet work hours observed on weekday mornings.",
    curation: {
      curationTrack: "ARTISANAL_FOCUS",
      vipPerks: [
        "Reserved window seat with its own power outlet",
        "Barista-led pour-over flight with origin notes",
        "Second single-origin cup on the house",
      ],
      curatorSecret:
        "Ask the barista for the current Chikmagalur micro-lot on V60 — it is rarely on the menu board but almost always in the hopper.",
      timeSavedMinutes: 20,
      curatedPairing: "Washed Ethiopian pour-over with an almond croissant",
    },
    coverImageKey:
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1600&q=80",
    altText:
      "Artisanal manual pour-over coffee brewing and single-origin roast at Third Wave Coffee Amanora",
  },
  {
    slug: "the-flour-works-european-garden-brunch",
    title: "The Flour Works: European Sourdough Brunch & Quiet Garden Dining",
    summary:
      "Handcrafted sourdough tartines, artisanal pastas, and relaxed pet-friendly garden dining in Magarpatta.",
    description:
      "A beloved Pune institution known for uncompromising European culinary traditions. Savor slow-fermented sourdough breads, light eggs benedict with house hollandaise, and decadent dark chocolate ganache under the leafy canopy of Magarpatta.",
    categoryKey: "culinary",
    addressLine: "North Court, Commercial Zone, Magarpatta City, Hadapsar",
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411028",
    latitude: 18.516512,
    longitude: 73.926045,
    durationMinutes: 120,
    minGuests: 1,
    maxGuests: 6,
    basePriceMinor: 95000,
    pricingUnit: "PER_PERSON",
    inclusions: [
      "3-Course brunch set (Starter, European Main, House Dessert)",
      "Specialty beverage or freshly squeezed juice",
      "Outdoor garden seating",
    ],
    exclusions: ["Custom celebration cakes"],
    guestNotes: "Pet-friendly outdoor terrace. Reservation recommended for Sunday brunch.",
    curation: {
      curationTrack: "ARTISANAL_FOCUS",
      vipPerks: [
        "Shaded garden table reserved for Sunday brunch",
        "Warm sourdough basket served on arrival",
        "Pet-friendly terrace spot held when you bring a companion",
      ],
      curatorSecret:
        "Sit under the frangipani at the far end of the garden — it is the quietest table, and the kitchen sends the first batch of sourdough out at 10:30 AM.",
      timeSavedMinutes: 35,
      curatedPairing: "Avocado sourdough tartine with a cold-pressed orange and rosemary spritz",
    },
    coverImageKey:
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=80",
    altText:
      "Tranquil European garden patio table with artisanal sourdough brunch at The Flour Works Magarpatta",
  },
  {
    slug: "cafe-peter-korean-bingsu-and-ramen-hadapsar",
    title: "Café Peter: Korean Street Food, Bingsu & Youthful Hangout",
    summary:
      "Indulge in authentic Korean ramen bowls, snowflake shaved bingsu desserts, and playful cafe culture.",
    description:
      "A trendy, vibrant hotspot serving comforting Korean soul food with an upbeat Indo-Korean twist. Famous for towering shaved-ice milk bingsu topped with fresh mango, boba, and condensed milk.",
    categoryKey: "culinary",
    addressLine: "Magarpatta Road, Near Destination Centre, Hadapsar",
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411028",
    latitude: 18.511045,
    longitude: 73.929012,
    durationMinutes: 90,
    minGuests: 1,
    maxGuests: 6,
    basePriceMinor: 59900,
    pricingUnit: "PER_PERSON",
    inclusions: ["Spicy or Miso Ramen bowl", "Signature mini Bingsu dessert", "Korean Iced Tea"],
    exclusions: ["Takeaway merchandise"],
    guestNotes:
      "Casual and walk-in friendly. Great for quick afternoon cravings and conversations.",
    curation: {
      curationTrack: "ARTISANAL_FOCUS",
      vipPerks: [
        "Corner table held through the evening rush",
        "Bingsu prepared to arrive the moment ramen plates clear",
        "Spice level noted in advance for the kitchen",
      ],
      curatorSecret:
        "Order the mango bingsu to share before you order ramen — it takes the longest to shave and arrives perfectly timed for dessert.",
      timeSavedMinutes: 20,
      curatedPairing: "Spicy kimchi ramen followed by a shared mango cheese bingsu",
    },
    coverImageKey:
      "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=1600&q=80",
    altText: "Steaming hot Japanese ramen bowl and Korean street desserts at Café Peter Hadapsar",
  },

  // ── Fine Dining, Rooftops & Celebrations ──────────────────────────────────
  {
    slug: "absolute-barbecues-wish-grill-seasons",
    title: "Absolute Barbecues: Live Tabletop Charcoal Grilling Feast",
    summary:
      "Unlimited personalized tabletop skewers, Mongolian Wish Grill stations, and an endless dessert counter.",
    description:
      "An interactive culinary extravaganza where a live glowing charcoal pit is fitted into your dining table. Baste and grill marinated prawns, spiced paneer, chicken drumsticks, and exotic meats cooked live to your exact taste.",
    categoryKey: "culinary",
    addressLine: "Level 2, Seasons Mall, Magarpatta City, Hadapsar",
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411028",
    latitude: 18.519345,
    longitude: 73.93221,
    durationMinutes: 120,
    minGuests: 2,
    maxGuests: 14,
    basePriceMinor: 109900,
    pricingUnit: "PER_PERSON",
    inclusions: [
      "Unlimited tabletop barbecue skewers (Veg & Non-Veg)",
      "Custom customized noodles at the Wish Grill live station",
      "Full lavish buffet & cold stone ice cream counter",
    ],
    exclusions: ["Alcoholic beverages"],
    guestNotes: "Come with an empty stomach! Table is held for 15 minutes past booking time.",
    curation: {
      curationTrack: "CONNOISSEUR",
      vipPerks: [
        "Grill table confirmed — no weekend waitlist at the door",
        "Welcome mocktail and starter skewers ready as you sit",
        "Wish Grill station walk-through with the chef",
      ],
      curatorSecret:
        "Hold back on the first two rounds of starters and head to the Wish Grill early — the chef plates far better when the counter is not crowded.",
      timeSavedMinutes: 40,
      curatedPairing: "Cajun grilled prawns with a kokum-ginger cooler",
    },
    coverImageKey:
      "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1600&q=80",
    altText:
      "Sizzling skewers over live tabletop charcoal grill at Absolute Barbecues Seasons Mall",
  },
  {
    slug: "spice-factory-rooftop-cocktails-hadapsar",
    title: "Spice Factory: Open-Air Rooftop Dining & Starlit Cocktails",
    summary:
      "Panoramic starlit views of the Hadapsar skyline, progressive fusion cuisine, and handcrafted molecular cocktails.",
    description:
      "Perched high above the bustling city, Spice Factory offers an open-air rooftop experience with breezy cabanas and warm amber lighting. Ideal for romantic dinner dates or celebratory weekend dinners with friends.",
    categoryKey: "celebrations",
    addressLine: "Roof Level, Mega Centre, Solapur-Pune Road, Hadapsar",
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411028",
    latitude: 18.503512,
    longitude: 73.928045,
    durationMinutes: 150,
    minGuests: 2,
    maxGuests: 8,
    basePriceMinor: 135000,
    pricingUnit: "PER_PERSON",
    inclusions: [
      "3-Course Chef's tasting menu",
      "Signature handcrafted cocktail or mocktail",
      "Guaranteed rooftop edge seating",
    ],
    exclusions: ["Hookah / Shisha"],
    guestNotes: "Smart casual dress code. Rooftop evening temperatures can be cool in winter.",
    curation: {
      curationTrack: "ALFRESCO_SUNDOWNER",
      vipPerks: [
        "Skyline-edge rooftop table held for golden hour",
        "Complimentary signature molecular cocktail on arrival",
        "Direct host entry — no lift-lobby wait on weekends",
      ],
      curatorSecret:
        "Ask for a table on the west-facing parapet at 6:30 PM — the sunset settles over the Hadapsar skyline before the main dining rush arrives.",
      timeSavedMinutes: 45,
      curatedPairing: "Smoked rosemary gin sour with tandoori broccoli and truffle mayo",
    },
    coverImageKey:
      "https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=1600&q=80",
    altText:
      "Starlit open-air rooftop dining deck with city skyline illumination at Spice Factory Hadapsar",
  },
  {
    slug: "cinepolis-vip-luxury-cinema-seasons",
    title: "Cinépolis VIP: Ultra-Luxury Recliner Cinema & In-Seat Dining",
    summary:
      "Plush leather recliners, personal butler service, and chef-curated gourmet dining while watching the latest releases.",
    description:
      "Upgrade regular movie night into a luxury getaway. The VIP lounges at Seasons Mall offer fully motorized leather recliners with personal service buttons, plush blankets, and an expansive chef-prepared food menu delivered directly to your seat.",
    categoryKey: "celebrations",
    addressLine: "Top Floor, Seasons Mall, Magarpatta, Pune",
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411028",
    latitude: 18.519912,
    longitude: 73.930812,
    durationMinutes: 180,
    minGuests: 1,
    maxGuests: 4,
    basePriceMinor: 95000,
    pricingUnit: "PER_PERSON",
    inclusions: [
      "VIP Recliner seat ticket",
      "Gourmet meal tray with mocktail delivered in-seat",
      "Exclusive VIP lounge access before showtime",
    ],
    exclusions: ["Extra concessions"],
    guestNotes:
      "Movie showtime selection confirmed 24 hours prior upon weekly theatrical schedule release.",
    curation: {
      curationTrack: "CONNOISSEUR",
      vipPerks: [
        "Centre-row recliners assigned for your party",
        "Butler-served welcome drink before the trailers",
        "Private lounge access while you wait for the doors",
      ],
      curatorSecret:
        "Choose row D — it sits at the projection's sweet spot, and the butler station is closest, so orders arrive in half the time.",
      timeSavedMinutes: 30,
      curatedPairing: "Truffle popcorn with a salted caramel cold brew",
    },
    coverImageKey:
      "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1600&q=80",
    altText:
      "Ultra-luxury plush cinema recliner theatre and big screen at Cinépolis VIP Seasons Mall",
  },

  // ── Wellness, Nature & Mindful Experiences ────────────────────────────────
  {
    slug: "o2-spa-aromatherapy-and-reflexology-seasons",
    title: "O2 Spa Haven: Deep Tissue Aromatherapy & Sound Healing",
    summary:
      "Melt away city stress with organic botanical essential oils, pressure point reflexology, and tranquil soundscapes.",
    description:
      "A calming sensory escape tucked inside Seasons Mall. Trained wellness therapists blend traditional Thai pressure-point techniques with aromatic Swedish strokes to alleviate neck tension, muscle fatigue, and mental overwhelm.",
    categoryKey: "wellness",
    addressLine: "Level 1, Seasons Mall, Magarpatta City, Hadapsar",
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411028",
    latitude: 18.519612,
    longitude: 73.931545,
    durationMinutes: 75,
    minGuests: 1,
    maxGuests: 2,
    basePriceMinor: 220000,
    pricingUnit: "PER_PERSON",
    inclusions: [
      "60-Minute Aromatherapy or Deep Tissue body massage",
      "15-Minute foot reflexology session",
      "Warm herbal detoxification tea",
    ],
    exclusions: ["Specialized salon styling services"],
    guestNotes:
      "Please inform therapists of any recent injuries or pressure preferences during intake.",
    curation: {
      curationTrack: "MINDFUL_WELLNESS",
      vipPerks: [
        "Therapist matched to your pressure preference in advance",
        "Herbal tea ritual and foot soak before the session",
        "Quiet-room recovery time with no rush to vacate",
      ],
      curatorSecret:
        "Book the first slot of the day: the rooms are at their stillest, and the sound-healing bowls are tuned fresh each morning.",
      timeSavedMinutes: 35,
      curatedPairing: "Lemongrass-ginger infusion after the session",
    },
    coverImageKey:
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1600&q=80",
    altText:
      "Tranquil luxury aromatherapy spa room with calming candlelight and warm herbal oils at O2 Spa",
  },
  {
    slug: "amanora-lake-sunset-walk-and-mindfulness",
    title: "Amanora Lake Walk: Sunset Stroll & Mindful Photography Journey",
    summary:
      "Golden hour guided walk around Amanora's peaceful lake, capturing architectural reflections and quiet moments.",
    description:
      "Experience the tranquility of Amanora Park Town's private lake. As dusk settles over the water, learn smartphone photography composition techniques, watch aquatic birds gather, and enjoy an unhurried, mindful evening walk.",
    categoryKey: "wellness",
    addressLine: "Amanora Park Town Central Lakefront, Hadapsar",
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411028",
    latitude: 18.516012,
    longitude: 73.936045,
    durationMinutes: 75,
    minGuests: 1,
    maxGuests: 8,
    basePriceMinor: 35000,
    pricingUnit: "PER_PERSON",
    inclusions: [
      "Guided 2.5km lakeside walking experience",
      "Mobile golden-hour photo framing guidance",
      "Refreshing cold-pressed juice or iced matcha",
    ],
    exclusions: ["Professional camera rental"],
    guestNotes: "Meet at the lakeside amphitheater steps 15 minutes before sunset.",
    curation: {
      curationTrack: "MINDFUL_WELLNESS",
      vipPerks: [
        "Small-group walk with a curator-photographer",
        "Golden-hour vantage points scouted for you",
        "Edited reflection shots shared after the walk",
      ],
      curatorSecret:
        "The east bank at the far end of the lake gives the cleanest tower reflections — the water is stillest there twenty minutes before sunset.",
      timeSavedMinutes: 25,
    },
    coverImageKey:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80",
    altText:
      "Peaceful golden-hour reflections and scenic lakeside walking trail at Amanora Lake Park",
  },
  {
    slug: "pottery-and-clay-wheel-workshop-magarpatta",
    title: "Artisanal Clay & Wheel Pottery: 2-Hour Beginner Workshop",
    summary:
      "Hands-on pottery wheel throwing: center natural clay, shape ceramic vessels, and bring home your fired creation.",
    description:
      "Connect with tactile creativity in an open-air art studio in Magarpatta. Learn the therapeutic rhythm of the electric pottery wheel. Under the patient guidance of an accomplished ceramic artist, transform raw red clay into functional bowls and cups.",
    categoryKey: "arts",
    addressLine: "Destination Centre Courtyard, Magarpatta City, Hadapsar",
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411028",
    latitude: 18.515234,
    longitude: 73.926812,
    durationMinutes: 120,
    minGuests: 1,
    maxGuests: 6,
    basePriceMinor: 125000,
    pricingUnit: "PER_PERSON",
    inclusions: [
      "All clay, studio tools, and pottery wheel access",
      "Expert 1-on-1 ceramic artist mentoring",
      "Kiln firing of 1 piece made by you (ready for pickup in 10 days)",
    ],
    exclusions: ["Courier shipping charges for fired ceramic pieces"],
    guestNotes:
      "Wear clothes that can get a little messy (aprons provided). Cut nails recommended for wheel throwing.",
    curation: {
      curationTrack: "ARTISANAL_FOCUS",
      vipPerks: [
        "Dedicated wheel for the full session — no sharing",
        "Your piece glazed and fired, then held for collection",
        "Studio chai served between throws",
      ],
      curatorSecret:
        "Ask the potter for the reclaimed red clay: it is more forgiving on a first throw and fires to a warm terracotta finish.",
      timeSavedMinutes: 30,
    },
    coverImageKey:
      "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?auto=format&fit=crop&w=1600&q=80",
    altText:
      "Artisan hands gently molding wet earthenware clay on a spinning pottery wheel in Magarpatta",
  },
  // ── Viman Nagar Corridor ──────────────────────────────────────────────────
  {
    slug: "hyatt-regency-brunch-wellness-viman-nagar",
    title: "Hyatt Regency: Artisanal Weekend Brunch & Poolside Retreat (Viman Nagar)",
    summary:
      "Luxury weekend culinary escape in Viman Nagar featuring multi-cuisine gourmet spreads, live grill stations, and serene poolside relaxation.",
    description:
      "Escape the urban rush at the Hyatt Regency in Viman Nagar. Indulge in an expansive gourmet weekend brunch spanning Mediterranean mezze, Asian street delicacies, artisanal pastas, and handcrafted Indian desserts. Complete your afternoon with complimentary access to the temperature-controlled outdoor pool and tranquil landscaped gardens.",
    categoryKey: "culinary",
    addressLine: "Weikfield IT Park, Pune-Nagar Road, Viman Nagar",
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411014",
    latitude: 18.5594209,
    longitude: 73.9120476,
    durationMinutes: 180,
    minGuests: 1,
    maxGuests: 8,
    basePriceMinor: 249900,
    pricingUnit: "PER_PERSON",
    inclusions: [
      "Full buffet brunch spread with live cooking counters",
      "Unlimited craft mocktails and artisanal iced teas",
      "Complimentary access to outdoor heated swimming pool",
      "Reserved lounge cabana seating",
      "Valet parking assistance",
    ],
    exclusions: ["Alcoholic beverages (available à la carte)", "Spa treatments at Arogya Spa"],
    guestNotes: "Smart casual dress code. Pool access requires proper swimwear.",
    curation: {
      curationTrack: "ALFRESCO_SUNDOWNER",
      vipPerks: [
        "Poolside cabana-side table reserved for brunch",
        "Welcome sparkling mocktail on arrival",
        "Pool and lounger access held through the afternoon",
      ],
      curatorSecret:
        "Ask for a table on the pool deck rather than indoors — the live grill is steps away and the loungers free up right after the 1 PM rush.",
      timeSavedMinutes: 50,
      curatedPairing: "Live-grill lamb chops with a watermelon-mint cooler",
    },
    coverImageKey:
      "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=1600&q=80",
    altText:
      "Sunlit luxury outdoor pool cabana and artisanal brunch buffet at Hyatt Regency Pune Viman Nagar",
  },
  {
    slug: "shizusan-dimsum-sushi-tasting-phoenix-marketcity",
    title: "Shizusan Asian Shophouse: Craft Dim Sum & Sushi Masterclass (Phoenix Marketcity)",
    summary:
      "Intimate Pan-Asian culinary journey at Phoenix Marketcity, Viman Nagar showcasing handcrafted dim sums, flame-seared nigiri, and Tokyo-inspired cocktails.",
    description:
      "Step into the vibrant 1920s shophouse ambiance of Shizusan at Phoenix Marketcity, Viman Nagar. Discover the delicate craft of Pan-Asian gastronomy with an exclusive 6-course tasting menu featuring crystal prawn dumplings, edamame truffle dim sums, torched salmon aburi sushi, and matcha chiffon gateau.",
    categoryKey: "culinary",
    addressLine: "Upper Ground Floor, Phoenix Marketcity, Viman Nagar",
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411014",
    latitude: 18.5623075,
    longitude: 73.9166721,
    durationMinutes: 120,
    minGuests: 2,
    maxGuests: 6,
    basePriceMinor: 189900,
    pricingUnit: "PER_PERSON",
    inclusions: [
      "6-course chef-curated Pan-Asian tasting menu",
      "Flight of 4 dim sums per person",
      "Chef demonstration of sushi rolling technique",
      "Signature welcoming mocktail or jasmine tea",
      "Reserved premium booth seating",
    ],
    exclusions: ["Hard liquor and wine bottles", "Mall parking fees"],
    guestNotes:
      "Please notify 24h in advance for Jain, gluten-free or seafood allergy preferences.",
    curation: {
      curationTrack: "CONNOISSEUR",
      vipPerks: [
        "Premium booth reserved — no mall-hour waitlist",
        "Chef's sushi-rolling demonstration at your table",
        "Jasmine tea or welcome mocktail on arrival",
      ],
      curatorSecret:
        "Request the booth beside the open dim sum station — you watch the crystal prawn dumplings being pleated before they reach your basket.",
      timeSavedMinutes: 40,
      curatedPairing: "Edamame truffle dim sum with a yuzu-lemongrass highball",
    },
    coverImageKey:
      "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=1600&q=80",
    altText:
      "Handcrafted crystal dim sum basket and flame-seared sushi platter at Shizusan Phoenix Marketcity",
  },
  {
    slug: "toit-brewery-craft-beer-tasting-kalyani-viman",
    title: "Toit Brewery: Craft Beer Tasting Flight & Wood-Fired Pizza (Viman / Kalyani)",
    summary:
      "Celebrated microbrewery experience in Viman Nagar / Kalyani Nagar featuring six flagship craft ales, brewmaster storytelling, and sourdough wood-fired pizzas.",
    description:
      "Immerse yourself in Pune's craft brewing culture at Toit, bordering Viman Nagar and Kalyani Nagar. Enjoy an exclusive guided flight of six artisanal craft beers—from the signature Tint-In-Wit Belgian ale to the robust Colonial Toit IPA—paired with hot, blistered sourdough pizzas from the brick wood-fire oven.",
    categoryKey: "culinary",
    addressLine: "Metro Station Road, near Aga Khan Palace, Kalyani Nagar / Viman Nagar Corridor",
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411006",
    latitude: 18.553466,
    longitude: 73.905882,
    durationMinutes: 150,
    minGuests: 2,
    maxGuests: 10,
    basePriceMinor: 149900,
    pricingUnit: "PER_PERSON",
    inclusions: [
      "Guided flight of 6 fresh craft beer tasters (100ml each)",
      "Choice of 1 signature 11-inch sourdough wood-fired pizza per 2 guests",
      "Brewery cellar tour with brewmaster explanation",
      "Brewery souvenir beer glass",
    ],
    exclusions: ["Additional beer pints beyond tasting flight", "Desserts"],
    guestNotes:
      "Valid government ID required for guests consuming alcohol (legal drinking age 21+).",
    curation: {
      curationTrack: "CONNOISSEUR",
      vipPerks: [
        "Guaranteed upper-deck table — zero weekend wait",
        "Complimentary seasonal craft taster pour on arrival",
        "Brewery cellar tour with the brewmaster",
      ],
      curatorSecret:
        "Ask for Table 14 on the upper deck at 7:15 PM for the golden-hour breeze, and avoid the ground floor's acoustic rush after 9.",
      timeSavedMinutes: 45,
      curatedPairing:
        "Tint-In-Wit Belgian witbier with a blistered truffle mushroom sourdough pizza",
    },
    coverImageKey:
      "https://images.unsplash.com/photo-1575037614876-c38a4d44f5b8?auto=format&fit=crop&w=1600&q=80",
    altText:
      "Six-glass craft beer tasting flight with artisan wood-fired pizza at Toit Brewery Kalyani Nagar",
  },
];

const CURATION_BY_SLUG: ReadonlyMap<string, ExperienceCuration> = new Map(
  PILOT_EXPERIENCES.map((experience) => [experience.slug, experience.curation]),
);

/**
 * The editorial layer for a published slug, or null when our curators have not
 * written one. Discovery overlays this onto whatever the database returned, so
 * a host-created listing simply carries no curation rather than a made-up one.
 */
export function pilotCurationFor(slug: string): ExperienceCuration | null {
  return CURATION_BY_SLUG.get(slug) ?? null;
}
