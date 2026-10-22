/**
 * The Pune pilot catalogue (Amanora, Seasons Mall, Magarpatta, Hadapsar).
 *
 * One definition, two readers. `scripts/seed-pune-pilot.ts` writes it into
 * PostgreSQL, which is where travellers and the copilot normally read it from.
 * The discovery repository's offline fallback serves it directly when the
 * database is unreachable outside production — so a developer without a
 * running Postgres sees exactly what the seed would have published, and the two
 * cannot drift apart.
 */

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
    coverImageKey: "images/amalfi-villa.jpg",
    altText: "Twilight bowling lanes with vibrant neon lighting at Smaaash Amanora",
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
    coverImageKey: "images/cappadocia.jpg",
    altText: "Atmospheric escape room puzzle chamber with antique locks and clue scrolls",
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
    coverImageKey: "images/hero-positano.jpg",
    altText: "Futuristic laser tag arena with glowing neon barriers and phaser equipment",
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
    coverImageKey: "images/amalfi-coast.jpg",
    altText: "Flight of craft beers in tasting glasses on wooden bar top at Effingut",
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
    coverImageKey: "images/santorini.jpg",
    altText: "Cold draught beer glass with white foam on outdoor cafe table overlooking fountain",
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
    coverImageKey: "images/rajasthan.jpg",
    altText: "Neon-lit modern bidding bar counter with cocktails and energetic ambiance",
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
    coverImageKey: "images/kyoto.jpg",
    altText: "Artisan coffee pour over ceremony with glass carafe and freshly baked pastry",
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
    coverImageKey: "images/bali.jpg",
    altText: "Sunlit garden cafe table with artisan sourdough breakfast and fresh coffee",
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
    coverImageKey: "images/kyoto.jpg",
    altText: "Bowl of authentic ramen with chopsticks and colorful Korean dessert bowl",
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
    coverImageKey: "images/rajasthan.jpg",
    altText: "Sizzling skewers on live tabletop charcoal barbecue grill with fresh dips",
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
    coverImageKey: "images/hero-positano.jpg",
    altText: "Breezy rooftop dining terrace at dusk with warm fairy lights and cocktail glasses",
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
    coverImageKey: "images/amalfi-villa.jpg",
    altText: "Luxury cinema auditorium with plush leather recliners and ambient lighting",
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
    coverImageKey: "images/maldives.jpg",
    altText: "Tranquil spa massage room with aroma candles and fresh flower decorations",
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
    coverImageKey: "images/serengeti.jpg",
    altText: "Serene lakeside walkway at sunset with golden water reflections and green trees",
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
    coverImageKey: "images/kyoto.jpg",
    altText: "Potter hands actively shaping wet clay bowl on spinning pottery wheel",
  },
];
