import { describe, expect, it } from "vitest";
import {
  EXPERIENCE_STATUSES,
  HOST_ACTIONS,
  applyHostAction,
  availableHostActions,
  canEditContent,
  canPerform,
  isVisibleToTravellers,
  type ExperienceStatus,
} from "@/modules/experiences/lifecycle";
import { ConflictError } from "@/lib/errors";

describe("canEditContent", () => {
  it("allows editing a draft and a rejected listing", () => {
    expect(canEditContent("DRAFT")).toBe(true);
    expect(canEditContent("REJECTED")).toBe(true);
  });

  it("locks a listing that is in review", () => {
    // A reviewer must rule on what they were shown.
    expect(canEditContent("IN_REVIEW")).toBe(false);
  });

  it("locks a published listing", () => {
    // An edit that skipped review would make approval meaningless: the listing
    // a traveller books would not be the one anybody approved.
    expect(canEditContent("PUBLISHED")).toBe(false);
  });

  it("locks suspended and archived listings", () => {
    expect(canEditContent("SUSPENDED")).toBe(false);
    expect(canEditContent("ARCHIVED")).toBe(false);
  });
});

describe("applyHostAction", () => {
  it("submits a draft into review", () => {
    expect(applyHostAction("submit", "DRAFT")).toBe("IN_REVIEW");
  });

  it("lets a rejected listing be resubmitted", () => {
    expect(applyHostAction("submit", "REJECTED")).toBe("IN_REVIEW");
  });

  it("withdraws a listing out of the queue", () => {
    expect(applyHostAction("withdraw", "IN_REVIEW")).toBe("DRAFT");
  });

  it("archives from every state a host controls", () => {
    for (const status of ["DRAFT", "REJECTED", "PUBLISHED", "SUSPENDED"] as const) {
      expect(applyHostAction("archive", status)).toBe("ARCHIVED");
    }
  });

  it("restores an archived listing to draft", () => {
    expect(applyHostAction("restore", "ARCHIVED")).toBe("DRAFT");
  });

  it("never lets a host reach PUBLISHED", () => {
    // FR-07 puts approval between draft and published, and approval is an
    // Operations permission. This is the assertion that keeps a host from
    // publishing their own listing.
    const reachable = new Set<ExperienceStatus>();

    for (const action of HOST_ACTIONS) {
      for (const status of EXPERIENCE_STATUSES) {
        if (canPerform(action, status)) reachable.add(applyHostAction(action, status));
      }
    }

    expect(reachable.has("PUBLISHED")).toBe(false);
    expect(reachable.has("SUSPENDED")).toBe(false);
  });

  it("refuses an illegal transition with a conflict, not a validation error", () => {
    // The request is well formed; the record is not where the caller thought.
    // The client needs to tell those apart.
    expect(() => applyHostAction("submit", "PUBLISHED")).toThrow(ConflictError);
    expect(() => applyHostAction("withdraw", "DRAFT")).toThrow(ConflictError);
    expect(() => applyHostAction("restore", "PUBLISHED")).toThrow(ConflictError);
    expect(() => applyHostAction("archive", "IN_REVIEW")).toThrow(ConflictError);
  });

  it("names the action and the state it refused", () => {
    expect(() => applyHostAction("submit", "IN_REVIEW")).toThrow(/in_review/i);
  });

  it("refuses double submission", () => {
    expect(() => applyHostAction("submit", "IN_REVIEW")).toThrow(ConflictError);
  });
});

describe("availableHostActions", () => {
  it("offers exactly what the transition table permits", () => {
    expect([...availableHostActions("DRAFT")].sort()).toEqual(["archive", "submit"]);
    expect([...availableHostActions("IN_REVIEW")]).toEqual(["withdraw"]);
    expect([...availableHostActions("PUBLISHED")]).toEqual(["archive"]);
    expect([...availableHostActions("ARCHIVED")]).toEqual(["restore"]);
  });

  it("never offers an action that would then be refused", () => {
    for (const status of EXPERIENCE_STATUSES) {
      for (const action of availableHostActions(status)) {
        expect(() => applyHostAction(action, status)).not.toThrow();
      }
    }
  });
});

describe("traveller visibility", () => {
  it("shows published listings and nothing else", () => {
    for (const status of EXPERIENCE_STATUSES) {
      expect(isVisibleToTravellers(status)).toBe(status === "PUBLISHED");
    }
  });
});
