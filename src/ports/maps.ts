/**
 * Location search and geocoding (FR-03).
 *
 * Two operations, because location search is genuinely two steps: turning what
 * someone is typing into a list of candidate places, and turning the one they
 * chose into a coordinate we can search around.
 *
 * The port is deliberately narrow. It says nothing about Google, place types,
 * session tokens or billing — those are provider concerns, and the whole point
 * of the boundary is that swapping provider does not reach into discovery.
 *
 * **Availability rule.** Discovery must keep working when this port cannot be
 * reached (PROJECT.md §6, CLAUDE.md §9). No caller may treat a maps failure as
 * fatal: keyword, category, price and destination search are all independent of
 * it, and a traveller who cannot geocode "Jaipur" must still be able to browse.
 */

import type { Coordinates } from "@/modules/discovery/geo";

export type { Coordinates };

/**
 * Retained as an alias so the earlier boundary-only shape keeps compiling.
 * `Coordinates` in `@/modules/discovery/geo` is the name to use.
 */
export type GeoPoint = Coordinates;

export interface PlaceSuggestion {
  /** Opaque to us. Only `geocode` on the same provider may interpret it. */
  readonly providerPlaceId: string;
  /** What to show in the suggestion list. */
  readonly description: string;
  /**
   * Present when the provider already knows where the place is, which lets the
   * caller skip the geocode round trip entirely.
   *
   * Google Autocomplete does not return coordinates, so its adapter leaves this
   * absent. The local provider — which resolves against cities that already
   * have published listings — always has them, so choosing a suggestion there
   * costs no second request.
   */
  readonly coordinates?: Coordinates;
}

export interface MapsPort {
  /** Provider identity, for logging and for telling a caller what it got. */
  readonly provider: string;

  autocomplete(query: string, limit: number): Promise<readonly PlaceSuggestion[]>;

  /** Resolve a suggestion to a point. Throws `NotFoundError` if it resolves to nothing. */
  geocode(providerPlaceId: string): Promise<Coordinates>;
}
