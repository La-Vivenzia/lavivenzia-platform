/**
 * How long the zero-key demo checkout holds its "Processing payment…" state.
 *
 * Long enough for the stages to read, short enough not to feel like a stall.
 * Applied only in `demo`: a real Razorpay verification is never padded.
 */
export const SIMULATED_PROCESSING_MS = 1_800;

/** Resolve with `promise`'s value, but no sooner than `ms` from now. Rejections pass straight through. */
export async function holdAtLeast<T>(promise: Promise<T>, ms: number): Promise<T> {
  const [value] = await Promise.all([
    promise,
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ]);
  return value;
}
