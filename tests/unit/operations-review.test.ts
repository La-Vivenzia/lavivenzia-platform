import { describe, expect, it } from "vitest";
import {
  EXPERIENCE_DECISIONS,
  HOST_DECISIONS,
  REVIEW_NOTE_LIMITS,
  availableExperienceDecisions,
  availableHostDecisions,
  experienceDecisionPermission,
  experienceDecisionRequiresNote,
  hostDecisionPermission,
  hostDecisionRequiresNote,
  resolveExperienceDecision,
  resolveHostDecision,
} from "@/modules/operations/review";
import { normalisePaging } from "@/modules/operations/service";
import { MAX_PAGE_SIZE, PAGE_SIZE } from "@/modules/operations/ports";
import { EXPERIENCE_STATUSES, type ExperienceStatus } from "@/modules/experiences/lifecycle";
import { HOST_VERIFICATION_STATUSES } from "@/modules/hosts/profile";
import { PERMISSIONS } from "@/modules/auth/permissions";
import { ConflictError, ValidationError } from "@/lib/errors";

const REASON = "The photographs do not show the venue itself.";

describe("experience decisions", () => {
  it("publishes an approved listing", () => {
    expect(resolveExperienceDecision("approve", "IN_REVIEW", null).nextStatus).toBe("PUBLISHED");
  });

  it("returns a rejected listing to the host", () => {
    expect(resolveExperienceDecision("reject", "IN_REVIEW", REASON).nextStatus).toBe("REJECTED");
  });

  it("suspends only a published listing", () => {
    expect(resolveExperienceDecision("suspend", "PUBLISHED", REASON).nextStatus).toBe("SUSPENDED");

    // Suspending a draft is meaningless — it is already invisible — and would
    // leave it in a state the host cannot recover from.
    expect(() => resolveExperienceDecision("suspend", "DRAFT", REASON)).toThrow(ConflictError);
    expect(() => resolveExperienceDecision("suspend", "IN_REVIEW", REASON)).toThrow(ConflictError);
  });

  it("reinstates a suspended listing", () => {
    expect(resolveExperienceDecision("reinstate", "SUSPENDED", null).nextStatus).toBe("PUBLISHED");
  });

  it("refuses a decision on a listing that is not in review", () => {
    for (const status of ["DRAFT", "PUBLISHED", "REJECTED", "ARCHIVED"] as const) {
      expect(() => resolveExperienceDecision("approve", status, null)).toThrow(ConflictError);
    }
  });

  it("refuses a second decision on a listing already decided", () => {
    // Two reviewers opening the same queue item is the ordinary way this
    // happens. The second one needs a conflict, not a field error.
    expect(() => resolveExperienceDecision("approve", "PUBLISHED", null)).toThrow(ConflictError);
    expect(() => resolveExperienceDecision("reject", "REJECTED", REASON)).toThrow(ConflictError);
  });

  it("names the state it refused, so the message is actionable", () => {
    expect(() => resolveExperienceDecision("approve", "PUBLISHED", null)).toThrow(/published/i);
  });
});

describe("reasons", () => {
  it("requires one wherever the decision costs the host something", () => {
    expect(experienceDecisionRequiresNote("reject")).toBe(true);
    expect(experienceDecisionRequiresNote("suspend")).toBe(true);
    expect(hostDecisionRequiresNote("reject")).toBe(true);
  });

  it("does not require one to approve", () => {
    expect(experienceDecisionRequiresNote("approve")).toBe(false);
    expect(experienceDecisionRequiresNote("reinstate")).toBe(false);
    expect(hostDecisionRequiresNote("verify")).toBe(false);
  });

  it("rejects a missing reason where one is required", () => {
    expect(() => resolveExperienceDecision("reject", "IN_REVIEW", null)).toThrow(ValidationError);
    expect(() => resolveExperienceDecision("suspend", "PUBLISHED", null)).toThrow(ValidationError);
    expect(() => resolveHostDecision("reject", "PENDING", null)).toThrow(ValidationError);
  });

  it("rejects a reason that is only whitespace", () => {
    expect(() => resolveExperienceDecision("reject", "IN_REVIEW", "        ")).toThrow(
      ValidationError,
    );
  });

  it("rejects a reason too short to act on", () => {
    // "No." is not feedback a host can do anything with.
    expect(() => resolveExperienceDecision("reject", "IN_REVIEW", "No.")).toThrow(ValidationError);
    expect(() =>
      resolveExperienceDecision("reject", "IN_REVIEW", "x".repeat(REVIEW_NOTE_LIMITS.min)),
    ).not.toThrow();
  });

  it("accepts an omitted reason where one is optional", () => {
    expect(() => resolveExperienceDecision("approve", "IN_REVIEW", null)).not.toThrow();
    expect(() => resolveHostDecision("verify", "PENDING", null)).not.toThrow();
  });

  it("checks the transition before the reason", () => {
    // A reviewer acting on a stale page should learn the record moved, not be
    // asked to write a justification for something that cannot happen.
    expect(() => resolveExperienceDecision("reject", "PUBLISHED", null)).toThrow(ConflictError);
  });
});

describe("permissions", () => {
  it("ties approval and rejection to experience:approve", () => {
    expect(experienceDecisionPermission("approve")).toBe(PERMISSIONS.EXPERIENCE_APPROVE);
    expect(experienceDecisionPermission("reject")).toBe(PERMISSIONS.EXPERIENCE_APPROVE);
  });

  it("ties suspension and reinstatement to experience:suspend", () => {
    // A separate capability: taking a live listing down is not the same act as
    // approving a new one, and an operator may hold one without the other.
    expect(experienceDecisionPermission("suspend")).toBe(PERMISSIONS.EXPERIENCE_SUSPEND);
    expect(experienceDecisionPermission("reinstate")).toBe(PERMISSIONS.EXPERIENCE_SUSPEND);
  });

  it("ties host decisions to host:verify", () => {
    expect(hostDecisionPermission("verify")).toBe(PERMISSIONS.HOST_VERIFY);
    expect(hostDecisionPermission("reject")).toBe(PERMISSIONS.HOST_VERIFY);
  });

  it("gives every decision a permission", () => {
    for (const decision of EXPERIENCE_DECISIONS) {
      expect(experienceDecisionPermission(decision)).toBeTruthy();
    }
    for (const decision of HOST_DECISIONS) {
      expect(hostDecisionPermission(decision)).toBeTruthy();
    }
  });
});

describe("host decisions", () => {
  it("verifies and rejects only a pending application", () => {
    expect(resolveHostDecision("verify", "PENDING", null).nextStatus).toBe("VERIFIED");
    expect(resolveHostDecision("reject", "PENDING", REASON).nextStatus).toBe("REJECTED");

    for (const status of ["DRAFT", "VERIFIED", "REJECTED"] as const) {
      expect(() => resolveHostDecision("verify", status, null)).toThrow(ConflictError);
    }
  });
});

describe("available decisions", () => {
  it("offers exactly what the table permits", () => {
    expect([...availableExperienceDecisions("IN_REVIEW")].sort()).toEqual(["approve", "reject"]);
    expect([...availableExperienceDecisions("PUBLISHED")]).toEqual(["suspend"]);
    expect([...availableExperienceDecisions("SUSPENDED")]).toEqual(["reinstate"]);
    expect([...availableExperienceDecisions("DRAFT")]).toEqual([]);
    expect([...availableExperienceDecisions("ARCHIVED")]).toEqual([]);

    expect([...availableHostDecisions("PENDING")].sort()).toEqual(["reject", "verify"]);
    expect([...availableHostDecisions("VERIFIED")]).toEqual([]);
  });

  it("never offers a decision that would then be refused", () => {
    for (const status of EXPERIENCE_STATUSES) {
      for (const decision of availableExperienceDecisions(status)) {
        expect(() => resolveExperienceDecision(decision, status, REASON)).not.toThrow();
      }
    }

    for (const status of HOST_VERIFICATION_STATUSES) {
      for (const decision of availableHostDecisions(status)) {
        expect(() => resolveHostDecision(decision, status, REASON)).not.toThrow();
      }
    }
  });

  it("never lets operations reach a state only the host controls", () => {
    // ARCHIVED is the host retiring their own listing. Operations suspends;
    // it does not archive on a host's behalf.
    const reachable = new Set<ExperienceStatus>();

    for (const status of EXPERIENCE_STATUSES) {
      for (const decision of availableExperienceDecisions(status)) {
        reachable.add(resolveExperienceDecision(decision, status, REASON).nextStatus);
      }
    }

    expect(reachable.has("ARCHIVED")).toBe(false);
    expect(reachable.has("DRAFT")).toBe(false);
  });
});

describe("normalisePaging", () => {
  it("defaults to the first page at the standard size", () => {
    expect(normalisePaging({})).toEqual({ page: 1, pageSize: PAGE_SIZE });
  });

  it("clamps an oversized page size", () => {
    // Otherwise a caller asks for the whole table in one request.
    expect(normalisePaging({ pageSize: 100_000 }).pageSize).toBe(MAX_PAGE_SIZE);
  });

  it("rejects a page below one", () => {
    expect(normalisePaging({ page: 0 }).page).toBe(1);
    expect(normalisePaging({ page: -5 }).page).toBe(1);
  });

  it("rejects a non-integer page size rather than producing a fractional offset", () => {
    expect(normalisePaging({ pageSize: 12.5 }).pageSize).toBe(PAGE_SIZE);
    expect(normalisePaging({ page: 2.7 }).page).toBe(1);
  });

  it("keeps a reasonable request unchanged", () => {
    expect(normalisePaging({ page: 3, pageSize: 50 })).toEqual({ page: 3, pageSize: 50 });
  });
});

describe("refusal messages", () => {
  it("reads as a sentence for every decision", () => {
    // Appending "d" to the verb produced "suspendd" and "rejectd". A message an
    // operator sees mid-decision has to be readable.
    const messages: string[] = [];

    for (const status of EXPERIENCE_STATUSES) {
      for (const decision of EXPERIENCE_DECISIONS) {
        try {
          resolveExperienceDecision(decision, status, REASON);
        } catch (error) {
          if (error instanceof ConflictError) messages.push(error.message);
        }
      }
    }

    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message).not.toMatch(/dd\.|rejectd|suspendd|verifyd|approvee/);
      // "a experience" — the article has to agree with the noun.
      expect(message).not.toContain("a experience");
      expect(message.startsWith("Cannot ")).toBe(true);
      expect(message.endsWith(".")).toBe(true);
    }
  });

  it("names both the decision and the state that blocked it", () => {
    expect(() => resolveExperienceDecision("suspend", "IN_REVIEW", REASON)).toThrow(
      "Cannot suspend an experience that is in review.",
    );
    expect(() => resolveHostDecision("verify", "VERIFIED", null)).toThrow(
      "Cannot verify a host that is verified.",
    );
  });
});
