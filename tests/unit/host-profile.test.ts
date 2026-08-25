import { describe, expect, it } from "vitest";
import {
  HOST_LIMITS,
  assessHostProfile,
  canEditProfile,
  canSubmitForVerification,
  requiredFieldsFor,
  type HostProfileDraft,
} from "@/modules/hosts/profile";

const COMPLETE: HostProfileDraft = {
  displayName: "Bagru Textile Studio",
  legalName: null,
  hostType: "INDIVIDUAL",
  contactEmail: "studio@example.com",
  contactPhone: "+91 98765 43210",
  websiteUrl: null,
  headline: "Third-generation block printers in Bagru",
  about: "a".repeat(HOST_LIMITS.about.min),
  city: "Jaipur",
  region: "Rajasthan",
  country: "IN",
};

describe("requiredFieldsFor", () => {
  it("asks an individual for the common fields only", () => {
    expect(requiredFieldsFor("INDIVIDUAL")).not.toContain("legalName");
  });

  it("also asks a company for its registered legal name", () => {
    // The brand a traveller sees and the entity that gets verified and paid are
    // different things, and only the second can be checked against a registry.
    expect(requiredFieldsFor("COMPANY")).toContain("legalName");
  });

  it("never requires optional editorial fields", () => {
    for (const type of ["INDIVIDUAL", "COMPANY"] as const) {
      expect(requiredFieldsFor(type)).not.toContain("websiteUrl");
      expect(requiredFieldsFor(type)).not.toContain("region");
    }
  });
});

describe("assessHostProfile", () => {
  it("reports a complete individual profile as complete", () => {
    const assessment = assessHostProfile(COMPLETE);
    expect(assessment.isComplete).toBe(true);
    expect(assessment.missing).toEqual([]);
    expect(assessment.completed).toBe(assessment.total);
  });

  it("reports each missing field once, with a readable label", () => {
    const assessment = assessHostProfile({ ...COMPLETE, city: null, contactPhone: null });

    expect(assessment.isComplete).toBe(false);
    expect(assessment.missing.map((entry) => entry.field).sort()).toEqual(["city", "contactPhone"]);
    expect(assessment.missing.every((entry) => entry.label.length > 0)).toBe(true);
  });

  it("treats whitespace as absent", () => {
    // Otherwise a space bar satisfies a required field.
    expect(assessHostProfile({ ...COMPLETE, city: "   " }).isComplete).toBe(false);
  });

  it("requires a legal name from a company and not from an individual", () => {
    const asCompany = assessHostProfile({ ...COMPLETE, hostType: "COMPANY", legalName: null });
    expect(asCompany.missing.map((entry) => entry.field)).toContain("legalName");

    const asIndividual = assessHostProfile({ ...COMPLETE, legalName: null });
    expect(asIndividual.isComplete).toBe(true);
  });

  it("rejects an About that is present but too short to be useful", () => {
    // A two-word About passes a null check and fails a reader.
    const assessment = assessHostProfile({ ...COMPLETE, about: "We host things." });

    expect(assessment.isComplete).toBe(false);
    expect(assessment.missing.some((entry) => entry.field === "about")).toBe(true);
  });

  it("counts progress out of the fields that actually apply", () => {
    const individual = assessHostProfile(COMPLETE);
    const company = assessHostProfile({ ...COMPLETE, hostType: "COMPANY", legalName: "X Pvt Ltd" });

    expect(company.total).toBe(individual.total + 1);
  });
});

describe("editing and submission gates", () => {
  it("allows editing only before and after a review, never during", () => {
    expect(canEditProfile("DRAFT")).toBe(true);
    expect(canEditProfile("REJECTED")).toBe(true);
    // Locked while pending: a reviewer must decide on the profile they were
    // shown, not on one that moved underneath them.
    expect(canEditProfile("PENDING")).toBe(false);
    // Locked once verified: re-verification is an operations action.
    expect(canEditProfile("VERIFIED")).toBe(false);
  });

  it("allows submission only from a state the host controls", () => {
    expect(canSubmitForVerification("DRAFT")).toBe(true);
    expect(canSubmitForVerification("REJECTED")).toBe(true);
    expect(canSubmitForVerification("PENDING")).toBe(false);
    expect(canSubmitForVerification("VERIFIED")).toBe(false);
  });
});
