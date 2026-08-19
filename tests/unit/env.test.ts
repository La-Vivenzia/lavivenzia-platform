import { describe, expect, it } from "vitest";
import { withoutEmptyValues } from "@/lib/env-utils";

/**
 * Regression cover for a real failure: a `.env` written from `.env.example`
 * leaves unused optional variables present but empty, which Zod treats as a set
 * value rather than an absent one. Before this, an unconfigured `EMAIL_FROM=`
 * stopped the process from booting.
 */
describe("withoutEmptyValues", () => {
  it("drops empty values so they read as absent", () => {
    expect(withoutEmptyValues({ EMAIL_FROM: "" })).toEqual({});
  });

  it("drops whitespace-only values", () => {
    expect(withoutEmptyValues({ EMAIL_FROM: "   " })).toEqual({});
  });

  it("drops undefined values", () => {
    expect(withoutEmptyValues({ EMAIL_FROM: undefined })).toEqual({});
  });

  it("keeps real values untouched, including surrounding whitespace", () => {
    expect(withoutEmptyValues({ APP_URL: "https://lavivenzia.com" })).toEqual({
      APP_URL: "https://lavivenzia.com",
    });
    expect(withoutEmptyValues({ TOKEN: " abc " })).toEqual({ TOKEN: " abc " });
  });

  it("keeps values that are falsy but meaningful", () => {
    expect(withoutEmptyValues({ WORKER_CONCURRENCY: "0", WORKER_ENABLED: "false" })).toEqual({
      WORKER_CONCURRENCY: "0",
      WORKER_ENABLED: "false",
    });
  });

  it("separates absent from empty across a mixed environment", () => {
    const result = withoutEmptyValues({
      DATABASE_URL: "postgresql://localhost:5432/db",
      RAZORPAY_KEY_ID: "",
      ANTHROPIC_API_KEY: undefined,
      AWS_REGION: "ap-south-1",
    });

    expect(result).toEqual({
      DATABASE_URL: "postgresql://localhost:5432/db",
      AWS_REGION: "ap-south-1",
    });
  });
});
