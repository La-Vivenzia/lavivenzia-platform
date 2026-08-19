/** Geocoding and place lookup port (FR-03). */

export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}

export interface PlaceSuggestion {
  readonly providerPlaceId: string;
  readonly description: string;
}

export interface MapsPort {
  autocomplete(query: string, limit: number): Promise<readonly PlaceSuggestion[]>;
  geocode(providerPlaceId: string): Promise<GeoPoint>;
}
