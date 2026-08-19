import type { SignedUpload, StoragePort } from "@/ports/storage";
import { NotImplementedError } from "@/lib/errors";

/** Amazon S3 adapter — integration boundary only. */
export class S3StorageAdapter implements StoragePort {
  createSignedUpload(_input: {
    readonly key: string;
    readonly contentType: string;
    readonly maxBytes: number;
  }): Promise<SignedUpload> {
    throw new NotImplementedError(
      "Object storage is not implemented: media handling is a later phase.",
    );
  }

  createSignedDownloadUrl(_key: string, _expiresInSeconds: number): Promise<string> {
    throw new NotImplementedError(
      "Object storage is not implemented: media handling is a later phase.",
    );
  }
}
