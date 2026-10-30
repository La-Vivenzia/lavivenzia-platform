import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/PageHeader";
import { TripArchitectView } from "@/components/trips/TripArchitectView";
import { EmptyState } from "@/components/ui/feedback";
import { getCheckoutService } from "@/lib/container";
import { getLogger } from "@/lib/logger";
import type { CheckoutMode } from "@/modules/booking/contract";
import { filterTripsByRating, listTrips } from "@/modules/trips/data";

export const metadata: Metadata = {
  title: "Trip Architect — Curated End-to-End Trips",
  description:
    "Two-day trips across Pune and the Western Ghats — the stay, every activity and the price, planned end to end.",
};

/** The checkout mode, degrading to "off" rather than taking the page down (ADR-0016). */
function checkoutMode(): CheckoutMode {
  try {
    return getCheckoutService().mode;
  } catch (error) {
    getLogger().error({ err: error }, "booking checkout is misconfigured; trip booking is closed");
    return "off";
  }
}

/**
 * The Trip Architect. `?trip=` preselects a trip, which is how the home
 * page's trip cards land on the one that was tapped.
 */
export default async function TripArchitectPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tripId = Array.isArray(params.trip) ? params.trip[0] : params.trip;
  const trips = filterTripsByRating(listTrips());

  return (
    <PageBody>
      <div className="flex flex-col gap-8 lg:gap-10">
        <PageHeader
          eyebrow="Trip Architect"
          title="Curated end-to-end trips"
          description="A stay, two days of experiences and the full price on one canvas. Every line has cleared our curators' bar."
        />
        {trips.length > 0 ? (
          <TripArchitectView
            trips={trips}
            checkoutMode={checkoutMode()}
            {...(tripId ? { initialTripId: tripId } : {})}
          />
        ) : (
          <EmptyState
            eyebrow="Trip Architect"
            title="No trips are open right now"
            description="Our curators are planning the next set. In the meantime, the concierge can find something for this evening."
          />
        )}
      </div>
    </PageBody>
  );
}
