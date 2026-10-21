import { InternalError } from "@/lib/errors";
import type { S3StorageConfig } from "@/adapters/storage/s3";

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
  readonly endpoint?: string | undefined;
  readonly accessKeyId?: string | undefined;
  readonly secretAccessKey?: string | undefined;
  readonly publicBaseUrl?: string | undefined;
}

export type StorageTransportPlan =
  { readonly kind: "local" } | { readonly kind: "s3"; readonly config: S3StorageConfig };

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

  // Each piece is checked by name so a half-configured deployment says which
  // one is missing, rather than failing on the first upload a host attempts.
  const bucket = input.bucket?.trim();
  const endpoint = input.endpoint?.trim();
  const accessKeyId = input.accessKeyId?.trim();
  const secretAccessKey = input.secretAccessKey?.trim();
  const publicBaseUrl = input.publicBaseUrl?.trim();

  if (!bucket) throw new InternalError("MEDIA_STORAGE=s3 requires S3_MEDIA_BUCKET.");
  if (!endpoint) throw new InternalError("MEDIA_STORAGE=s3 requires S3_ENDPOINT.");
  if (!accessKeyId) throw new InternalError("MEDIA_STORAGE=s3 requires S3_ACCESS_KEY_ID.");
  if (!secretAccessKey) {
    throw new InternalError("MEDIA_STORAGE=s3 requires S3_SECRET_ACCESS_KEY.");
  }
  if (!publicBaseUrl) {
    throw new InternalError(
      "MEDIA_STORAGE=s3 requires S3_PUBLIC_BASE_URL — the domain objects are served from, which is not the S3 endpoint.",
    );
  }

  return {
    kind: "s3",
    config: { bucket, endpoint, accessKeyId, secretAccessKey, publicBaseUrl },
  };
}
