import { resolve } from "node:path";
import type { StoragePort } from "@/ports/storage";
import { LocalStorageAdapter } from "@/adapters/storage/local";
import { S3StorageAdapter } from "@/adapters/storage/s3";
import { resolveStorageTransport, type StorageTransportPlan } from "@/adapters/storage/transport";
import { env } from "@/lib/env";

/**
 * Object storage wiring.
 *
 * The decision lives in `transport.ts`, which is pure and tested; this file
 * supplies it with the environment and builds the adapter it names.
 */

/** Build the adapter named by the plan. */
function buildStorageAdapter(plan: StorageTransportPlan): StoragePort {
  if (plan.kind === "local") {
    // Resolved from the process working directory, which for both `next dev`
    // and `next start` is the project root.
    return new LocalStorageAdapter({ publicDir: resolve(process.cwd(), "public") });
  }

  return new S3StorageAdapter(plan.config);
}

/** Build the storage adapter this environment calls for. */
export function createStorageAdapter(): StoragePort {
  return buildStorageAdapter(
    resolveStorageTransport({
      nodeEnv: env.NODE_ENV,
      transport: env.MEDIA_STORAGE,
      bucket: env.S3_MEDIA_BUCKET,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      publicBaseUrl: env.S3_PUBLIC_BASE_URL,
    }),
  );
}

export { resolveStorageTransport, MEDIA_STORAGE_TRANSPORTS } from "@/adapters/storage/transport";
export type { MediaStorageTransport, StorageTransportPlan } from "@/adapters/storage/transport";
