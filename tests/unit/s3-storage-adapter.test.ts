import { describe, expect, it, vi } from "vitest";
import { S3StorageAdapter, type S3SendClient } from "@/adapters/storage/s3";
import { resolveStorageTransport } from "@/adapters/storage/transport";
import { InternalError, ProviderUnavailableError, ValidationError } from "@/lib/errors";

/**
 * S3-compatible storage against Cloudflare R2.
 *
 * Every test drives a double, so the suite needs no bucket, no credential and
 * no network — **no object is ever written to a real bucket.**
 *
 * What is pinned is the behaviour the layers above depend on: a traversal key
 * never reaches the provider, a 4xx is terminal while a 5xx is retryable, and
 * the public URL is derived from the serving domain rather than the S3
 * endpoint — the R2 mistake that returns 401 to every traveller.
 */

const CONFIG = {
  bucket: "lavivenzia-media",
  endpoint: "https://account.r2.cloudflarestorage.com",
  accessKeyId: "test-access-key-id",
  secretAccessKey: "test-secret-not-a-real-credential",
  publicBaseUrl: "https://media.lavivenzia.com",
} as const;

const BYTES = new Uint8Array([1, 2, 3, 4]);

type SendFn = (command: unknown) => Promise<unknown>;
type SignFn = (client: S3SendClient, command: unknown, expiresIn: number) => Promise<string>;

function makeAdapter(over: { send?: SendFn; sign?: SignFn } = {}) {
  const send = vi.fn<SendFn>(over.send ?? (() => Promise.resolve({})));
  const sign = vi.fn<SignFn>(
    over.sign ?? (() => Promise.resolve("https://signed.example/object?sig=x")),
  );
  const client: S3SendClient = { send };

  return { adapter: new S3StorageAdapter(CONFIG, { client, sign }), send, sign };
}

function providerError(httpStatusCode: number, name = "SomeError") {
  return Object.assign(new Error(name), { name, $metadata: { httpStatusCode } });
}

describe("S3StorageAdapter — construction", () => {
  it.each([
    ["bucket", { ...CONFIG, bucket: "" }],
    ["endpoint", { ...CONFIG, endpoint: "" }],
    ["accessKeyId", { ...CONFIG, accessKeyId: "" }],
    ["publicBaseUrl", { ...CONFIG, publicBaseUrl: "" }],
  ])("refuses a missing %s at construction, not on first upload", (_name, config) => {
    expect(() => new S3StorageAdapter(config, {})).toThrow(InternalError);
  });
});

describe("S3StorageAdapter — publicUrl", () => {
  it("serves from the public domain, not the S3 endpoint", () => {
    // The R2 mistake worth a test: writing to the API host and reading from it
    // too produces URLs that 401 for every traveller.
    const { adapter } = makeAdapter();
    expect(adapter.publicUrl("experiences/a/b.jpg")).toBe(
      "https://media.lavivenzia.com/experiences/a/b.jpg",
    );
  });

  it("does not double the slash when the base URL has a trailing one", () => {
    const adapter = new S3StorageAdapter(
      { ...CONFIG, publicBaseUrl: "https://media.lavivenzia.com/" },
      {},
    );
    expect(adapter.publicUrl("a.jpg")).toBe("https://media.lavivenzia.com/a.jpg");
  });

  it("serves static assets from the app origin, not the bucket", () => {
    // Seed photography and brand marks ship in `public/` and are never uploaded.
    const { adapter } = makeAdapter();
    expect(adapter.publicUrl("images/amalfi-coast.jpg")).toBe("/images/amalfi-coast.jpg");
    expect(adapter.publicUrl("brand/mark.png")).toBe("/brand/mark.png");
  });
});

describe("S3StorageAdapter — key safety", () => {
  it.each(["../secrets.env", "/etc/passwd", "a\\b.jpg", ""])(
    "refuses %j before it reaches the provider",
    async (key) => {
      const { adapter, send } = makeAdapter();
      await expect(adapter.put({ key, contentType: "image/jpeg", bytes: BYTES })).rejects.toThrow(
        ValidationError,
      );
      expect(send).not.toHaveBeenCalled();
    },
  );
});

describe("S3StorageAdapter — put", () => {
  it("stores the object and returns its public URL", async () => {
    const { adapter, send } = makeAdapter();

    const stored = await adapter.put({
      key: "experiences/x.jpg",
      contentType: "image/jpeg",
      bytes: BYTES,
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(stored).toEqual({
      key: "experiences/x.jpg",
      url: "https://media.lavivenzia.com/experiences/x.jpg",
    });
  });

  it("treats a 4xx as terminal — our configuration, not a transient fault", async () => {
    const { adapter } = makeAdapter({ send: () => Promise.reject(providerError(403)) });

    await expect(
      adapter.put({ key: "a.jpg", contentType: "image/jpeg", bytes: BYTES }),
    ).rejects.toThrow(InternalError);
  });

  it("treats a 5xx as retryable", async () => {
    const { adapter } = makeAdapter({ send: () => Promise.reject(providerError(503)) });

    await expect(
      adapter.put({ key: "a.jpg", contentType: "image/jpeg", bytes: BYTES }),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it("treats an unrecognised failure as retryable rather than losing the upload", async () => {
    const { adapter } = makeAdapter({ send: () => Promise.reject(new Error("socket hang up")) });

    await expect(
      adapter.put({ key: "a.jpg", contentType: "image/jpeg", bytes: BYTES }),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it("never puts the credential in the error context", async () => {
    const { adapter } = makeAdapter({ send: () => Promise.reject(providerError(403)) });

    const error = await adapter
      .put({ key: "a.jpg", contentType: "image/jpeg", bytes: BYTES })
      .catch((caught: unknown) => caught);

    expect(JSON.stringify(error)).not.toContain(CONFIG.secretAccessKey);
  });
});

describe("S3StorageAdapter — signed URLs", () => {
  it("returns a signed upload with an expiry in the future", async () => {
    const { adapter } = makeAdapter();

    const upload = await adapter.createSignedUpload({
      key: "a.jpg",
      contentType: "image/jpeg",
      maxBytes: 1024,
    });

    expect(upload.url).toContain("https://");
    // Empty by design: a presigned PUT carries no form fields.
    expect(upload.fields).toEqual({});
    expect(upload.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("signs a download for the requested lifetime", async () => {
    const { adapter, sign } = makeAdapter();

    await adapter.createSignedDownloadUrl("docs/kyc.pdf", 300);

    expect(sign.mock.calls[0]?.[2]).toBe(300);
  });

  it("refuses to sign a traversal key", async () => {
    const { adapter, sign } = makeAdapter();
    await expect(adapter.createSignedDownloadUrl("../x", 60)).rejects.toThrow(ValidationError);
    expect(sign).not.toHaveBeenCalled();
  });
});

describe("S3StorageAdapter — remove", () => {
  it("removes the object", async () => {
    const { adapter, send } = makeAdapter();
    await adapter.remove("a.jpg");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("surfaces a provider failure rather than reporting a removal that did not happen", async () => {
    const { adapter } = makeAdapter({ send: () => Promise.reject(providerError(500)) });
    await expect(adapter.remove("a.jpg")).rejects.toThrow(ProviderUnavailableError);
  });
});

describe("resolveStorageTransport — s3 configuration", () => {
  const base = { nodeEnv: "production", transport: "s3" } as const;
  const full = {
    bucket: CONFIG.bucket,
    endpoint: CONFIG.endpoint,
    accessKeyId: CONFIG.accessKeyId,
    secretAccessKey: CONFIG.secretAccessKey,
    publicBaseUrl: CONFIG.publicBaseUrl,
  };

  it("plans an s3 transport when everything is present", () => {
    const plan = resolveStorageTransport({ ...base, ...full });
    expect(plan.kind).toBe("s3");
    expect(plan.kind === "s3" && plan.config.bucket).toBe(CONFIG.bucket);
  });

  it.each([
    ["S3_MEDIA_BUCKET", "bucket"],
    ["S3_ENDPOINT", "endpoint"],
    ["S3_ACCESS_KEY_ID", "accessKeyId"],
    ["S3_SECRET_ACCESS_KEY", "secretAccessKey"],
    ["S3_PUBLIC_BASE_URL", "publicBaseUrl"],
  ])("names %s when it is missing, rather than failing on first upload", (variable, field) => {
    expect(() => resolveStorageTransport({ ...base, ...full, [field]: undefined })).toThrow(
      new RegExp(variable),
    );
  });

  it("still refuses local storage in production", () => {
    expect(() => resolveStorageTransport({ nodeEnv: "production", transport: "local" })).toThrow(
      /ephemeral/,
    );
  });

  it("leaves local storage working in development", () => {
    expect(resolveStorageTransport({ nodeEnv: "development", transport: "local" }).kind).toBe(
      "local",
    );
  });
});
