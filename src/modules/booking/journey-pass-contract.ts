import type { ChapterRole, VipPrivilege } from "@/modules/journeys/data";

import type { CheckoutMode } from "./contract";

/**
 * The journey pass contract between `/api/v1/journeys/:id/pass` and the
 * journey page. Plain types and constants in a module with no directive and no
 * Node imports, so the route, the service and the client component share one
 * definition (tests/unit/client-boundary.test.ts).
 */

/** Largest party one journey pass covers. */
export const JOURNEY_PARTY_MAX = 12;

/** Longest holder name printed on a pass. */
export const JOURNEY_HOLDER_MAX = 60;

/** Every act on a simulated pass is in this state, and only this state. */
export const JOURNEY_ACT_STATUS = "PRE_ARRANGED_SIMULATED";

/**
 * Response to `POST /journeys/:id/pass/checkout`: the server-priced total and a
 * signed, short-lived intent the client returns untouched to issue the pass.
 */
export interface JourneyPassIntent {
  readonly mode: Exclude<CheckoutMode, "off">;
  readonly intent: string;
  readonly partySize: number;
  readonly amountMinor: number;
  readonly currency: string;
  readonly expiresAt: string;
  /** Present only in `razorpay_test`: what the hosted checkout needs. */
  readonly razorpay?: {
    readonly keyId: string;
    readonly orderId: string;
    readonly amountMinor: number;
    readonly currency: string;
  };
}

export interface JourneyPassAct {
  readonly role: ChapterRole;
  readonly label: string;
  readonly slug: string;
  readonly title: string;
  readonly addressLine: string;
  readonly coordinates: { readonly lat: number; readonly lng: number };
  readonly startMinute: number;
  readonly endMinute: number;
  /** The listing's live per-person price, read from PostgreSQL at issue. */
  readonly unitPriceMinor: number;
  readonly totalMinor: number;
  readonly privilege: VipPrivilege;
  /** What to say or show at this act's door. */
  readonly hostInstruction: string;
  readonly status: typeof JOURNEY_ACT_STATUS;
}

export interface JourneyPass {
  readonly simulated: true;
  readonly mode: Exclude<CheckoutMode, "off">;
  /** "LV-7K2Q" — printed with a leading "#". */
  readonly reference: string;
  /** "EMERALD BREEZE" — derived from the reference. */
  readonly secretKeyword: string;
  readonly holderName: string;
  readonly partySize: number;
  readonly journey: {
    readonly id: string;
    readonly title: string;
    readonly mood: string;
    readonly tagline: string;
  };
  readonly acts: readonly JourneyPassAct[];
  /**
   * One combined transaction for every act — "pay once, just show up".
   *
   * `SIMULATED` (demo): no provider, `chargedMinor` is zero. `PAID_TEST`
   * (Razorpay test mode): the server verified the payment signature against
   * the order it created; test money only, so nothing real moved.
   */
  readonly payment:
    | {
        readonly status: "SIMULATED";
        readonly provider: "none";
        readonly perPersonMinor: number;
        readonly amountMinor: number;
        /** Always zero. The field exists so no reader has to infer it. */
        readonly chargedMinor: 0;
        readonly currency: string;
        readonly paymentId: null;
      }
    | {
        readonly status: "PAID_TEST";
        readonly provider: "razorpay";
        readonly perPersonMinor: number;
        readonly amountMinor: number;
        /** Test-mode money: what the verified Razorpay order was for. */
        readonly chargedMinor: number;
        readonly currency: string;
        readonly paymentId: string;
      };
  readonly qr: {
    /** Signed; `verifyPassPayload` on the server checks it. */
    readonly payload: string;
    /** `data:image/svg+xml;base64,…`, for a plain `<img src>`. */
    readonly dataUri: string;
  };
  readonly timeSavedMinutes: number;
  readonly issuedAt: string;
  readonly notice: string;
}
