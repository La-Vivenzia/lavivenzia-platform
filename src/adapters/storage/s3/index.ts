import type { SignedUpload, StoragePort, StoredObject } from "@/ports/storage";
import { NotImplementedError } from "@/lib/errors";

/**
 * Amazon S3 adapter — integration boundary only.
 *
 * Still unimplemented, for the same reason the SES adapter was until the AWS
 * account arrived: there is no bucket and no credential to build against, and a
 * plausible-looking implementation nobody can run is worse than an honest gap.
 * The local adapter carries media in the meantime.
 *
 * Every method throws rather than returning empty data, so an accidental call
 * in a deployed environment is loud and traceable instead of silently losing a
 * host's photographs.
 */
export class S3StorageAdapter implements StoragePort {
  createSignedUpload(_input: {
    readonly key: string;
    readonly contentType: string;
    readonly maxBytes: number;
  }): Promise<SignedUpload> {
    throw new NotImplementedError("S3 object storage is not implemented yet.");
  }

  createSignedDownloadUrl(_key: string, _expiresInSeconds: number): Promise<string> {
    throw new NotImplementedError("S3 object storage is not implemented yet.");
  }

  put(_input: {
    readonly key: string;
    readonly contentType: string;
    readonly bytes: Uint8Array;
  }): Promise<StoredObject> {
    throw new NotImplementedError("S3 object storage is not implemented yet.");
  }

  remove(_key: string): Promise<void> {
    throw new NotImplementedError("S3 object storage is not implemented yet.");
  }

  publicUrl(_key: string): string {
    throw new NotImplementedError("S3 object storage is not implemented yet.");
  }
}
