import { describe, expect, it } from "vitest";
import { resolveEmailTransport } from "@/adapters/email/transport";
import { InternalError } from "@/lib/errors";
import { maskEmail } from "@/lib/mask";

/**
 * Transport selection is the control that stops a deployment from appearing to
 * send mail while sending none, so it is tested exhaustively rather than
 * incidentally.
 */

describe("resolveEmailTransport — development and test", () => {
  it("selects the console transport by default", () => {
    expect(resolveEmailTransport({ nodeEnv: "development", transport: "console" })).toEqual({
      kind: "console",
    });
  });

  it("allows the console transport under test", () => {
    expect(resolveEmailTransport({ nodeEnv: "test", transport: "console" }).kind).toBe("console");
  });

  it("allows SES outside production when it is fully configured", () => {
    const plan = resolveEmailTransport({
      nodeEnv: "development",
      transport: "ses",
      from: "no-reply@lavivenzia.com",
      region: "ap-south-1",
    });

    expect(plan).toEqual({
      kind: "ses",
      config: { from: "no-reply@lavivenzia.com", region: "ap-south-1" },
    });
  });

  it("ignores the sender when the console transport is selected", () => {
    // Local development must not require an SES identity to exist.
    expect(
      resolveEmailTransport({ nodeEnv: "development", transport: "console", from: undefined }).kind,
    ).toBe("console");
  });
});

describe("resolveEmailTransport — production", () => {
  it("refuses the console transport", () => {
    // It reports success while sending nothing, and writes login codes into a
    // retained log. Either alone would be disqualifying.
    expect(() => resolveEmailTransport({ nodeEnv: "production", transport: "console" })).toThrow(
      InternalError,
    );
  });

  it("names the fix in the refusal", () => {
    expect(() => resolveEmailTransport({ nodeEnv: "production", transport: "console" })).toThrow(
      /EMAIL_TRANSPORT=ses/,
    );
  });

  it("accepts SES with a sender and region", () => {
    const plan = resolveEmailTransport({
      nodeEnv: "production",
      transport: "ses",
      from: "no-reply@lavivenzia.com",
      region: "ap-south-1",
    });

    expect(plan.kind).toBe("ses");
  });
});

describe("resolveEmailTransport — missing configuration", () => {
  it("refuses SES with no sender", () => {
    expect(() =>
      resolveEmailTransport({ nodeEnv: "production", transport: "ses", region: "ap-south-1" }),
    ).toThrow(/EMAIL_FROM/);
  });

  it("refuses SES with no region", () => {
    expect(() =>
      resolveEmailTransport({
        nodeEnv: "production",
        transport: "ses",
        from: "no-reply@lavivenzia.com",
      }),
    ).toThrow(/AWS_REGION/);
  });

  it("treats a whitespace-only sender as missing", () => {
    // A secret store that returns an empty string must not read as configured.
    expect(() =>
      resolveEmailTransport({
        nodeEnv: "production",
        transport: "ses",
        from: "   ",
        region: "ap-south-1",
      }),
    ).toThrow(/EMAIL_FROM/);
  });

  it("trims the values it accepts", () => {
    const plan = resolveEmailTransport({
      nodeEnv: "production",
      transport: "ses",
      from: "  no-reply@lavivenzia.com  ",
      region: " ap-south-1 ",
    });

    expect(plan).toEqual({
      kind: "ses",
      config: { from: "no-reply@lavivenzia.com", region: "ap-south-1" },
    });
  });
});

describe("resolveEmailTransport — configuration set", () => {
  it("passes a configuration set through when one is supplied", () => {
    const plan = resolveEmailTransport({
      nodeEnv: "production",
      transport: "ses",
      from: "no-reply@lavivenzia.com",
      region: "ap-south-1",
      configurationSet: "lavivenzia-transactional",
    });

    expect(plan).toEqual({
      kind: "ses",
      config: {
        from: "no-reply@lavivenzia.com",
        region: "ap-south-1",
        configurationSet: "lavivenzia-transactional",
      },
    });
  });

  it("omits the key entirely when the value is blank", () => {
    // SES rejects an empty ConfigurationSetName; absent is not the same as "".
    const plan = resolveEmailTransport({
      nodeEnv: "production",
      transport: "ses",
      from: "no-reply@lavivenzia.com",
      region: "ap-south-1",
      configurationSet: "  ",
    });

    expect(plan.kind === "ses" && "configurationSet" in plan.config).toBe(false);
  });
});

describe("maskEmail", () => {
  it("keeps the address recognisable without reproducing it", () => {
    expect(maskEmail("traveller@example.com")).toBe("t*******r@example.com");
  });

  it("preserves length, so a support agent can spot a typo", () => {
    expect(maskEmail("ab@example.com")).toBe("**@example.com");
    expect(maskEmail("abc@example.com")).toBe("a*c@example.com");
  });

  it("masks anything that is not address-shaped", () => {
    expect(maskEmail("not-an-address")).toBe("***");
    expect(maskEmail("@example.com")).toBe("***");
    expect(maskEmail("")).toBe("***");
  });

  it("splits on the last @, so a quoted local part cannot smuggle a domain through", () => {
    expect(maskEmail("a@b@example.com")).toBe("a*b@example.com");
  });
});
