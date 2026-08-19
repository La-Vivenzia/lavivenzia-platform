import type { GeoPoint, MapsPort, PlaceSuggestion } from "@/ports/maps";
import { NotImplementedError } from "@/lib/errors";

/** Google Maps adapter — integration boundary only. */
export class GoogleMapsAdapter implements MapsPort {
  autocomplete(_query: string, _limit: number): Promise<readonly PlaceSuggestion[]> {
    throw new NotImplementedError(
      "Maps integration is not implemented: location discovery is a later phase (FR-03).",
    );
  }

  geocode(_providerPlaceId: string): Promise<GeoPoint> {
    throw new NotImplementedError(
      "Maps integration is not implemented: location discovery is a later phase (FR-03).",
    );
  }
}
