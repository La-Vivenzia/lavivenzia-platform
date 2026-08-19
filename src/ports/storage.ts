/** Object storage port — media, invoices, vouchers. */

export interface SignedUpload {
  readonly url: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly expiresAt: Date;
}

export interface StoragePort {
  /** Browsers upload directly to storage; bytes never transit the app server. */
  createSignedUpload(input: {
    readonly key: string;
    readonly contentType: string;
    readonly maxBytes: number;
  }): Promise<SignedUpload>;

  createSignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
}
