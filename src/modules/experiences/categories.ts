/**
 * Experience categories (FR-06).
 *
 * ── ASSUMPTION, pending founder confirmation ──────────────────────────────
 * No document defines the category taxonomy. This is a working set derived
 * from the launch scope in PROJECT.md §4 and the editorial positioning in
 * DESIGN.md §2. See docs/ASSUMPTIONS.md → A-010.
 *
 * It is deliberately cheap to change: categories are rows, the seed reconciles
 * them, and a listing that loses its category falls back to null rather than
 * breaking (`ON DELETE SET NULL`). Revising the taxonomy is an edit here and a
 * reseed, never a migration.
 * ──────────────────────────────────────────────────────────────────────────
 */

export interface CategoryDefinition {
  readonly key: string;
  readonly name: string;
  readonly description: string;
}

/** Order here is the order travellers and hosts see. */
export const CATEGORY_DEFINITIONS: readonly CategoryDefinition[] = [
  {
    key: "culinary",
    name: "Culinary & Dining",
    description: "Private tables, chef collaborations, tastings and market journeys.",
  },
  {
    key: "heritage",
    name: "Heritage & Culture",
    description: "Palaces, monuments, living crafts and the stories behind them.",
  },
  {
    key: "wellness",
    name: "Wellness & Retreat",
    description: "Restorative practice, ritual and quiet — from a morning to a week.",
  },
  {
    key: "adventure",
    name: "Adventure & Outdoors",
    description: "Mountains, deserts and trails, guided by people who know them.",
  },
  {
    key: "wildlife",
    name: "Wildlife & Safari",
    description: "Naturalist-led encounters in reserves, forests and wetlands.",
  },
  {
    key: "arts",
    name: "Arts & Craft",
    description: "Studios, ateliers and workshops with practising artists.",
  },
  {
    key: "voyages",
    name: "Sailing & Voyages",
    description: "Backwaters, coastlines and charters, by water and by rail.",
  },
  {
    key: "celebrations",
    name: "Celebrations & Occasions",
    description: "Private gatherings, proposals and milestones, arranged in full.",
  },
];

export const CATEGORY_KEYS: readonly string[] = CATEGORY_DEFINITIONS.map(
  (category) => category.key,
);
