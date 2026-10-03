import { describe, expect, it } from "vitest";

import type { DiscoverableTalent, OwnedTalentApplication, TalentPosting } from "@/components/talent/talent-flow-types";
import { filterDiscoverableTalent, filterTalentApplicants, filterTalentJobs } from "@/lib/talent/talent-filters";

describe("Talent filters", () => {
  it("filters and sorts jobs by persisted dimensions", () => {
    const postings = [{ id: "1", status: "PUBLISHED", createdById: "owner", title: "Growth lead", description: "Regional operations", requiredSkills: ["analytics", "automation"], workMode: "HYBRID", countryCode: "SA", city: "Riyadh", salaryMaxMinor: 2_000_000, qualityScore: 80, updatedAt: "2026-09-20" }, { id: "2", status: "PUBLISHED", createdById: "owner", title: "Designer", description: "Product design", requiredSkills: ["design"], workMode: "REMOTE", countryCode: "AE", city: "Dubai", salaryMaxMinor: 3_000_000, qualityScore: 70, updatedAt: "2026-09-21" }] as TalentPosting[];
    expect(filterTalentJobs(postings, "viewer", { query: "", skills: "analytics, automation", city: "", countryCode: "SA", minSalaryMajor: 15_000, sort: "quality", workMode: "HYBRID" }).map((posting) => posting.id)).toEqual(["1"]);
  });

  it("filters candidates by consent-scoped profile fields", () => {
    const candidates = [{ id: "1", headline: "Analyst", summary: "Operations", city: "Riyadh", countryCode: "SA", yearsExperience: 6, skills: ["analytics", "automation"], desiredWorkModes: ["HYBRID"], availability: "30 days", updatedAt: "2026-09-20", user: { profile: { displayName: "Candidate" } } }] as DiscoverableTalent[];
    expect(filterDiscoverableTalent(candidates, { query: "", skills: "automation", countryCode: "SA", minExperience: 5, availability: "30", workMode: "HYBRID", sort: "experience" })).toHaveLength(1);
    expect(filterDiscoverableTalent(candidates, { query: "", skills: "", countryCode: "", minExperience: 7, availability: "", workMode: "", sort: "recent" })).toHaveLength(0);
  });

  it("filters and ranks applications without exposing new fields", () => {
    const applications = [{ id: "low", status: "SUBMITTED", matchScore: 40, jobPosting: { id: "job", title: "Role" }, createdAt: "2026-09-01", updatedAt: "2026-09-01" }, { id: "high", status: "UNDER_REVIEW", matchScore: 90, jobPosting: { id: "job", title: "Role" }, createdAt: "2026-09-02", updatedAt: "2026-09-03" }] as OwnedTalentApplication[];
    expect(filterTalentApplicants(applications, { jobPostingId: "job", minMatch: 50, sort: "match", status: "UNDER_REVIEW" }).map((application) => application.id)).toEqual(["high"]);
  });
});