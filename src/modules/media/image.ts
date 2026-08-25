import { ValidationError } from "@/lib/errors";

/**
 * Image validation for host-uploaded media.
 *
 * The rule this file exists to enforce: **the declared content type is not
 * evidence of anything.** A browser sends whatever the client says, and a
 * client is an attacker whenever it wants to be. What the file actually is gets
 * decided by reading its leading bytes.
 */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Below this, it is not a photograph — it is a probe or a truncated upload. */
export const MIN_IMAGE_BYTES = 512;

export const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;

export function isAllowedImageType(value: string): value is AllowedImageType {
  return Object.prototype.hasOwnProperty.call(ALLOWED_IMAGE_TYPES, value);
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50]; // "WEBP", at offset 8

/**
 * Identify an image from its magic bytes, or return null.
 *
 * Only the three formats the platform accepts are recognised. Anything else —
 * including formats that are perfectly valid images, such as SVG — is
 * unidentified on purpose. SVG in particular is a script-execution vector
 * dressed as a picture, and it has no place in a gallery.
 */
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  if (startsWith(bytes, JPEG_SIGNATURE)) return "image/jpeg";
  if (startsWith(bytes, PNG_SIGNATURE)) return "image/png";
  if (startsWith(bytes, RIFF_SIGNATURE) && startsWith(bytes, WEBP_SIGNATURE, 8)) {
    return "image/webp";
  }
  return null;
}

export interface ValidatedImage {
  /** The type the bytes actually are, not the type the client claimed. */
  readonly contentType: AllowedImageType;
  readonly extension: string;
  readonly byteSize: number;
}

/**
 * Validate an uploaded image, or reject it.
 *
 * Size is checked before the signature so that a large hostile upload is
 * refused on a cheap comparison rather than after inspection. The declared type
 * is checked too, but only so that a genuine mismatch is reported clearly — it
 * never decides what the file is.
 */
export function validateImageUpload(input: {
  readonly bytes: Uint8Array;
  readonly declaredType: string;
}): ValidatedImage {
  const { bytes, declaredType } = input;

  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new ValidationError(
      `Images must be ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB or smaller.`,
      { byteSize: bytes.byteLength },
    );
  }

  if (bytes.byteLength < MIN_IMAGE_BYTES) {
    throw new ValidationError("That file is too small to be a photograph.", {
      byteSize: bytes.byteLength,
    });
  }

  const actual = sniffImageType(bytes);

  if (actual === null) {
    throw new ValidationError("Upload a JPEG, PNG or WebP image.", { declaredType });
  }

  if (!isAllowedImageType(declaredType) || declaredType !== actual) {
    // Not necessarily an attack — some clients guess badly — but the file is
    // stored and served under a content type, and that type must be the truth.
    throw new ValidationError("That file does not match the image type it claims to be.", {
      declaredType,
      actualType: actual,
    });
  }

  return {
    contentType: actual,
    extension: ALLOWED_IMAGE_TYPES[actual],
    byteSize: bytes.byteLength,
  };
}
