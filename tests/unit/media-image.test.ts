import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  MIN_IMAGE_BYTES,
  isAllowedImageType,
  sniffImageType,
  validateImageUpload,
} from "@/modules/media/image";
import { buildStorageKey } from "@/modules/media/storage-key";
import { ValidationError } from "@/lib/errors";

/** A byte array of `size` beginning with `signature`, so it is a plausible file. */
function fileWith(signature: readonly number[], size = 4096): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(signature, 0);
  return bytes;
}

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// "RIFF" .... "WEBP"
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];

describe("sniffImageType", () => {
  it("identifies the three accepted formats from their magic bytes", () => {
    expect(sniffImageType(fileWith(JPEG))).toBe("image/jpeg");
    expect(sniffImageType(fileWith(PNG))).toBe("image/png");
    expect(sniffImageType(fileWith(WEBP))).toBe("image/webp");
  });

  it("does not recognise SVG", () => {
    // Deliberate. SVG is a script-execution vector dressed as a picture, and it
    // has no place in a gallery served from our own origin.
    const svg = new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`);
    expect(sniffImageType(svg)).toBeNull();
  });

  it("does not recognise a script, an archive, or a PDF", () => {
    expect(sniffImageType(new TextEncoder().encode("#!/bin/sh\nrm -rf /"))).toBeNull();
    expect(sniffImageType(fileWith([0x50, 0x4b, 0x03, 0x04]))).toBeNull();
    expect(sniffImageType(fileWith([0x25, 0x50, 0x44, 0x46]))).toBeNull();
  });

  it("rejects a RIFF container that is not WebP", () => {
    // A WAV file also starts with RIFF; only the tag at offset 8 settles it.
    const wav = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45];
    expect(sniffImageType(fileWith(wav))).toBeNull();
  });

  it("does not read past the end of a short buffer", () => {
    expect(sniffImageType(new Uint8Array([0x52, 0x49]))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe("validateImageUpload", () => {
  it("accepts a well-formed image whose declared type is honest", () => {
    const result = validateImageUpload({
      bytes: fileWith(JPEG),
      declaredType: "image/jpeg",
    });

    expect(result).toEqual({ contentType: "image/jpeg", extension: "jpg", byteSize: 4096 });
  });

  it("rejects a file whose bytes contradict its declared type", () => {
    // The central rule: a client sends whatever it likes, so the file is
    // whatever its bytes say. A PNG announced as a JPEG is refused rather than
    // quietly stored under the wrong content type.
    expect(() => validateImageUpload({ bytes: fileWith(PNG), declaredType: "image/jpeg" })).toThrow(
      ValidationError,
    );
  });

  it("rejects a script announced as an image", () => {
    const bytes = new Uint8Array(1024);
    bytes.set(new TextEncoder().encode("<?php system($_GET[0]); ?>"), 0);

    expect(() => validateImageUpload({ bytes, declaredType: "image/png" })).toThrow(
      ValidationError,
    );
  });

  it("rejects an image announced as a type we do not accept", () => {
    expect(() => validateImageUpload({ bytes: fileWith(JPEG), declaredType: "image/gif" })).toThrow(
      ValidationError,
    );
  });

  it("rejects anything over the size ceiling", () => {
    const oversized = fileWith(JPEG, MAX_IMAGE_BYTES + 1);
    expect(() => validateImageUpload({ bytes: oversized, declaredType: "image/jpeg" })).toThrow(
      /MB or smaller/,
    );
  });

  it("accepts a file at exactly the ceiling", () => {
    const exact = fileWith(JPEG, MAX_IMAGE_BYTES);
    expect(() => validateImageUpload({ bytes: exact, declaredType: "image/jpeg" })).not.toThrow();
  });

  it("rejects a file too small to be a photograph", () => {
    expect(() =>
      validateImageUpload({
        bytes: fileWith(JPEG, MIN_IMAGE_BYTES - 1),
        declaredType: "image/jpeg",
      }),
    ).toThrow(/too small/);
  });

  it("never echoes the file contents in the error", () => {
    const bytes = new Uint8Array(1024);
    bytes.set(new TextEncoder().encode("SECRET-MARKER-CONTENT"), 0);

    try {
      validateImageUpload({ bytes, declaredType: "image/png" });
      expect.unreachable("expected a rejection");
    } catch (error) {
      expect(JSON.stringify((error as ValidationError).context)).not.toContain("SECRET-MARKER");
    }
  });
});

describe("isAllowedImageType", () => {
  it("accepts only the three published types", () => {
    expect(isAllowedImageType("image/jpeg")).toBe(true);
    expect(isAllowedImageType("image/png")).toBe(true);
    expect(isAllowedImageType("image/webp")).toBe(true);
    expect(isAllowedImageType("image/svg+xml")).toBe(false);
    expect(isAllowedImageType("image/gif")).toBe(false);
  });

  it("is not fooled by inherited object properties", () => {
    expect(isAllowedImageType("constructor")).toBe(false);
    expect(isAllowedImageType("toString")).toBe(false);
  });
});

describe("buildStorageKey", () => {
  it("namespaces the key by experience and gives it a random name", () => {
    const key = buildStorageKey("abc-123", "jpg");
    expect(key).toMatch(/^experiences\/abc-123\/[0-9a-f-]{36}\.jpg$/);
  });

  it("never repeats", () => {
    const keys = new Set(Array.from({ length: 50 }, () => buildStorageKey("abc", "png")));
    expect(keys.size).toBe(50);
  });

  it("contributes no client-supplied path component", () => {
    // The client never names its own file, so there is no filename to traverse
    // out of and no second extension to smuggle through.
    const key = buildStorageKey("abc", "webp");
    expect(key).not.toContain("..");
    expect(key.split("/")).toHaveLength(3);
  });
});
