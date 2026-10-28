import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { InternalError, NotImplementedError, ValidationError } from "@/lib/errors";
import { isStaticAssetKey, type StoragePort, type StoredObject } from "@/ports/storage";

/**
 * Local filesystem storage — development only.
 *
 * Writes under `public/`, which Next.js serves statically, so an uploaded
 * photograph is fetchable immediately with no route, no signing and no AWS
 * account. Experience media is public content by definition; it is what
 * travellers browse.
 *
 * The presigned methods are deliberately unimplemented. Presigning is an S3
 * capability and imitating it against a local directory would be theatre — a
 * signature nothing verifies. They stay loud until the S3 adapter is built.
 */

/** Root inside `public/`. Kept in one constant so the URL and the path agree. */
export const LOCAL_MEDIA_PREFIX = "uploads";

/**
 * Keys this adapter will accept.
 *
 * Lower-case alphanumerics, hyphens, dots and slashes, with no leading slash
 * and no dot segment anywhere. Keys are server-generated, so this should never
 * reject in practice — which is exactly why it is worth asserting. The day a
 * key becomes even partly caller-influenced, this is the line that stops it
 * being a path traversal.
 */
const SAFE_KEY = /^[a-z0-9][a-z0-9/._-]*$/;

function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.includes("..") || key.includes("//")) {
    throw new ValidationError("Invalid storage key.", { key });
  }
}

export interface LocalStorageConfig {
  /** Absolute path to the `public` directory. */
  readonly publicDir: string;
}

export class LocalStorageAdapter implements StoragePort {
  readonly #root: string;

  constructor(config: LocalStorageConfig) {
    this.#root = resolve(config.publicDir, LOCAL_MEDIA_PREFIX);
  }

  /**
   * Resolve a key to a path, then prove the result is still inside the root.
   *
   * Belt and braces over `assertSafeKey`: path resolution is where traversal
   * bugs actually land, so the check that matters is made against the resolved
   * path rather than against the string that produced it.
   */
  #pathFor(key: string): string {
    assertSafeKey(key);

    const path = resolve(join(this.#root, key));
    if (path !== this.#root && !path.startsWith(this.#root + sep)) {
      throw new InternalError("Resolved storage path escaped the media root.");
    }

    return path;
  }

  async put(input: {
    readonly key: string;
    readonly contentType: string;
    readonly bytes: Uint8Array;
  }): Promise<StoredObject> {
    const path = this.#pathFor(input.key);

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.bytes);

    return { key: input.key, url: this.publicUrl(input.key) };
  }

  async remove(key: string): Promise<void> {
    // `force` makes a missing file a success. Removal is called during
    // reconciliation and on retries, where "already gone" is the desired end
    // state rather than an error.
    await rm(this.#pathFor(key), { force: true });
  }

  publicUrl(key: string): string {
    assertSafeKey(key);
    // Static photography and brand assets ship in `public/images` and
    // `public/brand`, not under the upload root.
    if (isStaticAssetKey(key)) {
      return `/${key}`;
    }
    return `/${LOCAL_MEDIA_PREFIX}/${key}`;
  }

  createSignedUpload(): Promise<never> {
    throw new NotImplementedError(
      "Presigned uploads require S3. The local adapter stores bytes through put() instead.",
    );
  }

  createSignedDownloadUrl(): Promise<never> {
    throw new NotImplementedError(
      "Signed downloads require S3. Local media is served publicly from /uploads.",
    );
  }
}
