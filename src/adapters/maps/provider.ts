/**
 * Which location provider a given configuration selects.
 *
 * Split out from the factory so it can be tested exhaustively without an
 * environment, a logger or a network — the same shape as
 * `resolveEmailTransport`, for the same reason.
 *
 * Unlike email, an unconfigured provider is **not** an error. Email has no
 * meaningful degraded mode: a login code either sends or the product is broken.
 * Location search does have one — the catalogue knows where its own cities are
 * — so an absent Google key selects the local provider rather than refusing to
 * start. That difference is the whole decision this module encodes.
 */

export const MAPS_PROVIDERS = ["google", "local"] as const;
export type MapsProviderKind = (typeof MAPS_PROVIDERS)[number];

export interface MapsProviderInput {
  readonly apiKey?: string | undefined;
  readonly languageCode?: string | undefined;
}

export type MapsProviderPlan =
  | { readonly kind: "local" }
  | {
      readonly kind: "google";
      readonly config: { readonly apiKey: string; readonly languageCode?: string };
    };

export function resolveMapsProvider(input: MapsProviderInput): MapsProviderPlan {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) return { kind: "local" };

  const languageCode = input.languageCode?.trim();

  return {
    kind: "google",
    config: { apiKey, ...(languageCode ? { languageCode } : {}) },
  };
}
