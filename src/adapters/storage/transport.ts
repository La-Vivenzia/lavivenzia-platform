import { InternalError } from "@/lib/errors";

/**
 * Object storage transport selection.
 *
 * Same shape as the email transport (ADR-0011): a harmless default for
 * development, the real provider in production, and a refusal for the
 * combination that would silently do the wrong thing.
 */

export const MEDIA_STORAGE_TRANSPORTS = ["local", "s3"] as const;
export type MediaStorageTransport = (typeof MEDIA_STORAGE_TRANSPORTS)[number];

export interface StorageTransportInput {
  readonly nodeEnv: "development" | "test" | "production";
  readonly transport: MediaStorageTransport;
  readonly bucket?: string | undefined;
}

export type StorageTransportPlan =
  { readonly kind: "local" } | { readonly kind: "s3"; readonly bucket: string };

/**
 * Decide which storage backing to use.
 *
 * Local storage is refused in production and the reason is not tidiness: a
 * containerised task has an ephemeral filesystem, so every uploaded photograph
 * would vanish on the next deploy while appearing to have been saved. That is a
 * silent data-loss bug, and it is the kind that surfaces weeks later when a host
 * asks why their listing has no images.
 *
 * Pure, so the rule is testable without an environment or a filesystem.
 */
export function resolveStorageTransport(input: StorageTransportInput): StorageTransportPlan {
  const isProduction = input.nodeEnv === "production";

  if (input.transport === "local") {
    if (isProduction) {
      throw new InternalError(
        "MEDIA_STORAGE=local is not permitted in production: container filesystems are ephemeral and uploads would be lost on deploy. Set MEDIA_STORAGE=s3.",
      );
    }
    return { kind: "local" };
  }

  const bucket = input.bucket?.trim();
  if (!bucket) {
    throw new InternalError("MEDIA_STORAGE=s3 requires S3_MEDIA_BUCKET.");
  }

  return { kind: "s3", bucket };
}
