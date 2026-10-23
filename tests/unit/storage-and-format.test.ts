import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveStorageTransport } from "@/adapters/storage/transport";
import { LOCAL_MEDIA_PREFIX, LocalStorageAdapter } from "@/adapters/storage/local";
import { InternalError, NotImplementedError, ValidationError } from "@/lib/errors";
import {
  formatDuration,
  formatGuestRange,
  formatMinorForInput,
  formatMoneyMinor,
  formatRelativeTime,
  minorUnitsPerMajor,
  parseMoneyToMinor,
} from "@/lib/format";

describe("resolveStorageTransport", () => {
  it("selects local storage outside production", () => {
    expect(resolveStorageTransport({ nodeEnv: "development", transport: "local" })).toEqual({
      kind: "local",
    });
    expect(resolveStorageTransport({ nodeEnv: "test", transport: "local" }).kind).toBe("local");
  });

  it("refuses local storage in production", () => {
    // A container filesystem is ephemeral: uploads would appear to save and
    // then vanish on the next deploy. That is silent data loss, and it surfaces
    // weeks later when a host asks where their photographs went.
    expect(() => resolveStorageTransport({ nodeEnv: "production", transport: "local" })).toThrow(
      InternalError,
    );
  });

  it("names the fix in the refusal", () => {
    expect(() => resolveStorageTransport({ nodeEnv: "production", transport: "local" })).toThrow(
      /MEDIA_STORAGE=s3/,
    );
  });

  it("requires a bucket for S3", () => {
    expect(() => resolveStorageTransport({ nodeEnv: "production", transport: "s3" })).toThrow(
      /S3_MEDIA_BUCKET/,
    );
  });

  it("treats a whitespace-only bucket as missing", () => {
    expect(() =>
      resolveStorageTransport({ nodeEnv: "production", transport: "s3", bucket: "  " }),
    ).toThrow(/S3_MEDIA_BUCKET/);
  });

  it("accepts a fully configured S3 transport and trims each value", () => {
    // The plan now carries the whole provider configuration rather than just
    // the bucket, because the adapter needs an endpoint, a credential and a
    // separate public domain to be constructible at all.
    expect(
      resolveStorageTransport({
        nodeEnv: "production",
        transport: "s3",
        bucket: " media ",
        endpoint: " https://account.r2.cloudflarestorage.com ",
        accessKeyId: " key-id ",
        secretAccessKey: " secret ",
        publicBaseUrl: " https://media.lavivenzia.com ",
      }),
    ).toEqual({
      kind: "s3",
      config: {
        bucket: "media",
        endpoint: "https://account.r2.cloudflarestorage.com",
        accessKeyId: "key-id",
        secretAccessKey: "secret",
        publicBaseUrl: "https://media.lavivenzia.com",
      },
    });
  });
});

describe("LocalStorageAdapter", () => {
  let root: string;
  let adapter: LocalStorageAdapter;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "lv-storage-"));
    adapter = new LocalStorageAdapter({ publicDir: root });
  });

  it("stores bytes and reports where they can be read", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const stored = await adapter.put({
      key: "experiences/abc/one.jpg",
      contentType: "image/jpeg",
      bytes,
    });

    expect(stored.url).toBe(`/${LOCAL_MEDIA_PREFIX}/experiences/abc/one.jpg`);

    const written = await readFile(join(root, LOCAL_MEDIA_PREFIX, "experiences/abc/one.jpg"));
    expect(new Uint8Array(written)).toEqual(bytes);
  });

  it("creates intermediate directories", async () => {
    await expect(
      adapter.put({
        key: "experiences/deep/nested/x.png",
        contentType: "image/png",
        bytes: new Uint8Array([9]),
      }),
    ).resolves.toBeDefined();
  });

  it("removes an object, and removing a missing one succeeds", async () => {
    await adapter.put({
      key: "experiences/abc/two.jpg",
      contentType: "image/jpeg",
      bytes: new Uint8Array([5]),
    });
    await expect(adapter.remove("experiences/abc/two.jpg")).resolves.toBeUndefined();
    // Idempotent: removal runs during reconciliation and on retries, where
    // "already gone" is the desired end state.
    await expect(adapter.remove("experiences/abc/two.jpg")).resolves.toBeUndefined();
  });

  it("refuses a key that tries to climb out of the media root", async () => {
    for (const key of [
      "../escape.jpg",
      "experiences/../../escape.jpg",
      "/etc/passwd",
      "a//b.jpg",
    ]) {
      await expect(
        adapter.put({ key, contentType: "image/jpeg", bytes: new Uint8Array([1]) }),
      ).rejects.toThrow(ValidationError);
    }
  });

  it("did not write anything outside the root while refusing", async () => {
    // Proves the refusals above were refusals, not failures after the fact.
    const sentinel = join(root, "sentinel.txt");
    await writeFile(sentinel, "untouched");
    await adapter
      .put({ key: "../sentinel.txt", contentType: "image/jpeg", bytes: new Uint8Array([1]) })
      .catch(() => undefined);

    expect(await readFile(sentinel, "utf8")).toBe("untouched");
  });

  it("serves static photography and brand assets from public/, not the upload root", () => {
    expect(adapter.publicUrl("images/amalfi-coast.jpg")).toBe("/images/amalfi-coast.jpg");
    expect(adapter.publicUrl("brand/mark.png")).toBe("/brand/mark.png");
    expect(adapter.publicUrl("experiences/abc/cover.jpg")).toBe("/uploads/experiences/abc/cover.jpg");
  });

  it("refuses to build a URL for an unsafe key", () => {
    expect(() => adapter.publicUrl("../escape.jpg")).toThrow(ValidationError);
  });

  it("throws rather than imitating presigned uploads", () => {
    // Presigning is an S3 capability. A fake signature that nothing verifies
    // would be worse than an honest gap.
    expect(() => adapter.createSignedUpload()).toThrow(NotImplementedError);
    expect(() => adapter.createSignedDownloadUrl()).toThrow(NotImplementedError);
  });
});

describe("money formatting", () => {
  it("knows how many minor units a currency has", () => {
    expect(minorUnitsPerMajor("INR")).toBe(100);
    expect(minorUnitsPerMajor("usd")).toBe(100);
    // Zero-decimal and three-decimal currencies are why this is a lookup and
    // not a hard-coded division by 100.
    expect(minorUnitsPerMajor("JPY")).toBe(1);
    expect(minorUnitsPerMajor("KWD")).toBe(1000);
  });

  it("formats minor units as money", () => {
    const formatted = formatMoneyMinor(450_000, "INR");
    expect(formatted).toContain("4,500");
  });

  it("formats zero rather than treating it as absent", () => {
    expect(formatMoneyMinor(0, "INR")).not.toBeNull();
  });

  it("returns null for an unset price", () => {
    expect(formatMoneyMinor(null, "INR")).toBeNull();
  });

  it("round-trips through the editable form", () => {
    expect(parseMoneyToMinor(formatMinorForInput(450_000, "INR"), "INR")).toBe(450_000);
    expect(formatMinorForInput(null, "INR")).toBe("");
  });

  it("parses what a person actually types", () => {
    expect(parseMoneyToMinor("4500", "INR")).toBe(450_000);
    expect(parseMoneyToMinor("4,500.50", "INR")).toBe(450_050);
    expect(parseMoneyToMinor(" 0 ", "INR")).toBe(0);
  });

  it("rounds rather than truncating", () => {
    // Truncation quietly loses money on every conversion.
    expect(parseMoneyToMinor("10.005", "INR")).toBe(1001);
  });

  it("rejects nonsense and negatives", () => {
    expect(parseMoneyToMinor("", "INR")).toBeNull();
    expect(parseMoneyToMinor("free", "INR")).toBeNull();
    expect(parseMoneyToMinor("-100", "INR")).toBeNull();
    expect(parseMoneyToMinor("Infinity", "INR")).toBeNull();
  });
});

describe("duration and guests", () => {
  it("writes durations out in words", () => {
    expect(formatDuration(45)).toBe("45 minutes");
    expect(formatDuration(60)).toBe("1 hour");
    expect(formatDuration(150)).toBe("2 hours 30 minutes");
    expect(formatDuration(1440)).toBe("1 day");
    expect(formatDuration(2880)).toBe("2 days");
  });

  it("returns null when the duration is unset", () => {
    expect(formatDuration(null)).toBeNull();
  });

  it("phrases a guest range", () => {
    expect(formatGuestRange(2, 8)).toBe("2–8 guests");
    expect(formatGuestRange(4, 4)).toBe("4 guests");
    expect(formatGuestRange(1, 1)).toBe("1 guest");
    expect(formatGuestRange(2, null)).toBe("From 2 guests");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");

  it("uses relative wording inside a week", () => {
    expect(formatRelativeTime(new Date("2026-08-25T11:59:40.000Z"), now)).toBe("just now");
    expect(formatRelativeTime(new Date("2026-08-25T11:55:00.000Z"), now)).toBe("5 minutes ago");
    expect(formatRelativeTime(new Date("2026-08-25T08:00:00.000Z"), now)).toBe("4 hours ago");
    expect(formatRelativeTime(new Date("2026-08-23T12:00:00.000Z"), now)).toBe("2 days ago");
  });

  it("switches to a date beyond a week", () => {
    // Nobody converts "43 days ago" into a date in their head.
    expect(formatRelativeTime(new Date("2026-07-12T12:00:00.000Z"), now)).toMatch(/Jul/);
  });

  it("uses singular wording for one unit", () => {
    expect(formatRelativeTime(new Date("2026-08-25T11:59:00.000Z"), now)).toBe("1 minute ago");
    expect(formatRelativeTime(new Date("2026-08-24T12:00:00.000Z"), now)).toBe("1 day ago");
  });
});
