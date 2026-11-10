# Engineering Specification: Phase 1 — Viman Nagar Catalogue Expansion & Automated 30-Day Slots Seeding

You are implementing Phase 1 of the Pune Pilot MVP for `lavivenziaSAAS`.

---

## 1. Objective

1. Add the **Viman Nagar corridor** to the Pune Pilot catalogue (`src/data/pune-pilot.ts`) and Concierge Hotspots (`src/modules/concierge/options.ts`).
2. Implement automated **30-Day Rolling Availability Slots Seeding** in `scripts/seed-pune-pilot.ts` so all 19 Pune pilot experiences have active, bookable time slots for travellers.
3. Ensure 100% test passing (`npm test`), zero type errors (`npm run typecheck`), and clean formatting.

---

## 2. Requirements & File Specifications

### A. Viman Nagar Experiences in `src/data/pune-pilot.ts`

Add 3 authentic, verified Viman Nagar experiences to `PILOT_EXPERIENCES`:

1. **Hyatt Regency Pune & Residences**:
   - `slug`: `'hyatt-regency-brunch-wellness-viman-nagar'`
   - `title`: `'Hyatt Regency: Artisanal Weekend Brunch & Poolside Wellness Retreat'`
   - `summary`: `'Luxury weekend culinary escape featuring multi-cuisine gourmet spreads, live grill stations, and serene poolside relaxation.'`
   - `description`: `'Escape the urban rush at the Hyatt Regency in Viman Nagar. Indulge in an expansive gourmet weekend brunch spanning Mediterranean mezze, Asian street delicacies, artisanal pastas, and handcrafted Indian desserts. Complete your afternoon with complimentary access to the temperature-controlled outdoor pool and tranquil landscaped gardens.'`
   - `categoryKey`: `'culinary'`
   - `addressLine`: `'Weikfield IT Park, Pune-Nagar Road, Viman Nagar'`
   - `city`: `'Pune'`
   - `region`: `'Maharashtra'`
   - `postalCode`: `'411014'`
   - `latitude`: `18.5594209`
   - `longitude`: `73.9120476`
   - `durationMinutes`: `180`
   - `minGuests`: `1`
   - `maxGuests`: `8`
   - `basePriceMinor`: `249900` (₹2,499)
   - `pricingUnit`: `'PER_PERSON'`
   - `coverImageKey`: `'experiences/hyatt-regency-viman-nagar.jpg'`
   - `altText`: `'Sunlit luxury poolside dining setup with artisanal brunch platters at Hyatt Regency Pune'`
   - `inclusions`: `['Full buffet brunch spread with live cooking counters', 'Unlimited craft mocktails and artisanal iced teas', 'Complimentary access to outdoor heated swimming pool', 'Reserved lounge cabana seating', 'Valet parking assistance']`
   - `exclusions`: `['Alcoholic beverages (available à la carte)', 'Spa treatments at Arogya Spa']`
   - `guestNotes`: `'Smart casual dress code. Pool access requires proper swimwear.'`

2. **Shizusan Asian Shophouse (Phoenix Marketcity)**:
   - `slug`: `'shizusan-dimsum-sushi-tasting-phoenix-marketcity'`
   - `title`: `'Shizusan Asian Shophouse: Craft Dim Sum Flight & Sushi Tasting Masterclass'`
   - `summary`: `'Intimate Pan-Asian culinary journey showcasing handcrafted dim sums, flame-seared nigiri, and Tokyo-inspired cocktails.'`
   - `description`: `'Step into the vibrant 1920s shophouse ambiance of Shizusan at Phoenix Marketcity, Viman Nagar. Discover the delicate craft of Pan-Asian gastronomy with an exclusive 6-course tasting menu featuring crystal prawn dumplings, edamame truffle dim sums, torched salmon aburi sushi, and matcha chiffon gateau.'`
   - `categoryKey`: `'culinary'`
   - `addressLine`: `'Upper Ground Floor, Phoenix Marketcity, Viman Nagar'`
   - `city`: `'Pune'`
   - `region`: `'Maharashtra'`
   - `postalCode`: `'411014'`
   - `latitude`: `18.5623075`
   - `longitude`: `73.9166721`
   - `durationMinutes`: `120`
   - `minGuests`: `2`
   - `maxGuests`: `6`
   - `basePriceMinor`: `189900` (₹1,899)
   - `pricingUnit`: `'PER_PERSON'`
   - `coverImageKey`: `'experiences/shizusan-viman-nagar.jpg'`
   - `altText`: `'Bamboo steamer baskets filled with crystal dim sums and artisanal sushi platter at Shizusan'`
   - `inclusions`: `['6-course chef-curated Pan-Asian tasting menu', 'Flight of 4 dim sums per person', 'Chef demonstration of sushi rolling technique', 'Signature welcoming mocktail or jasmine tea', 'Reserved premium booth seating']`
   - `exclusions`: `['Hard liquor and wine bottles', 'Mall parking fees']`
   - `guestNotes`: `'Please notify 24h in advance for Jain, gluten-free or seafood allergy preferences.'`

3. **Toit Brewery Pune**:
   - `slug`: `'toit-brewery-craft-beer-tasting-kalyani-viman'`
   - `title`: `'Toit Brewery: Craft Beer Tasting Flight & Wood-Fired Pizza Pairing'`
   - `summary`: `'Celebrated microbrewery experience featuring six flagship craft ales, brewmaster storytelling, and sourdough wood-fired pizzas.'`
   - `description`: `'Immerse yourself in Pune\'s craft brewing culture at Toit, bordering Viman Nagar and Kalyani Nagar. Enjoy an exclusive guided flight of six artisanal craft beers—from the signature Tint-In-Wit Belgian ale to the robust Colonial Toit IPA—paired with hot, blistered sourdough pizzas from the brick wood-fire oven.'`
   - `categoryKey`: `'culinary'`
   - `addressLine`: `'Metro Station Road, near Aga Khan Palace, Kalyani Nagar / Viman Nagar Corridor'`
   - `city`: `'Pune'`
   - `region`: `'Maharashtra'`
   - `postalCode`: `'411006'`
   - `latitude`: `18.553466`
   - `longitude`: `73.905882`
   - `durationMinutes`: `150`
   - `minGuests`: `2`
   - `maxGuests`: `10`
   - `basePriceMinor`: `149900` (₹1,499)
   - `pricingUnit`: `'PER_PERSON'`
   - `coverImageKey`: `'experiences/toit-brewery-viman-nagar.jpg'`
   - `altText`: `'Six-glass flight of amber craft beer with artisan wood-fired pizza at Toit Brewery'`
   - `inclusions`: `['Guided flight of 6 fresh craft beer tasters (100ml each)', 'Choice of 1 signature 11-inch sourdough wood-fired pizza per 2 guests', 'Brewery cellar tour with brewmaster explanation', 'Brewery souvenir beer glass']`
   - `exclusions`: `['Additional beer pints beyond tasting flight', 'Desserts']`
   - `guestNotes`: `'Valid government ID required for guests consuming alcohol (legal drinking age 21+).'`

---

### B. Concierge Hotspots in `src/modules/concierge/options.ts`

1. Update `HotspotId`:
   ```ts
   export type HotspotId = "seasons" | "amanora" | "magarpatta" | "viman_nagar";
   ```
2. Add Viman Nagar entry to `HOTSPOTS`:
   ```ts
   {
     id: "viman_nagar",
     label: "Viman Nagar",
     latitude: 18.5594,
     longitude: 73.9120,
     aliases: ["viman", "viman nagar", "phoenix", "phoenix marketcity"],
     addressMarkers: ["Viman Nagar", "Phoenix Marketcity", "Weikfield"],
     withinRadiusMetres: 1200,
   }
   ```
3. Update any concierge unit tests in `tests/unit/concierge.test.ts` or related test suites that assert on hotspot counts or IDs so all tests pass cleanly.

---

### C. 30-Day Slots Seeding in `scripts/seed-pune-pilot.ts`

Implement a dedicated function `seedSlotsForExperience(experienceId: string)`:

- Generate 3 slots per day for 30 consecutive days (starting today, Day 0 to Day 29):
  1. **Afternoon Slot**: 12:30 PM to 02:30 PM IST
  2. **Evening Slot**: 05:00 PM to 07:00 PM IST
  3. **Dinner Slot**: 08:00 PM to 10:30 PM IST
- IST is UTC + 5h30m. Construct accurate ISO timestamps.
- Capacity: 12 guests. `reservedCount`: 0. `status`: `OPEN`. `bookingCutoffMinutes`: 60.
- Use `prisma.experienceSlot.upsert` with `where: { experienceId_startsAt: { experienceId, startsAt } }`.
- Log progress: `Seeding 30-day availability slots for ${PILOT_EXPERIENCES.length} experiences (~${PILOT_EXPERIENCES.length * 90} slots)...`

---

## 3. Verification & Safety Gates

1. Run `npm test` and ensure all 48 test suites pass (target: 953+ tests).
2. Run `npm run typecheck` (`tsc --noEmit`) to verify 0 TypeScript errors.
3. Run `npm run lint` to guarantee clean code style.
4. Keep all existing working features and dark mode toggle safe.
