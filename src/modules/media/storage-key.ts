import { randomUUID } from "node:crypto";

/**
 * Storage keys for uploaded media.
 *
 * Separate from `image.ts` because it needs `node:crypto`, which has no browser
 * build — and the upload UI imports the size and type limits from that module.
 * Keeping the key builder here means the policy can be shared with the client
 * without dragging a Node built-in into the bundle.
 */

/**
 * Where an image is stored.
 *
 * Every part is server-generated. The client contributes no part of the path —
 * not the name, not the extension, not the directory — so there is no filename
 * to traverse out of and no extension to smuggle through.
 */
export function buildStorageKey(experienceId: string, extension: string): string {
  return `experiences/${experienceId}/${randomUUID()}.${extension}`;
}
