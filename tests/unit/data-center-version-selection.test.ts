import { describe, expect, it } from "vitest";
import {
  compareByPolicy, DC_VERSION_SELECTION_POLICY, rankVersions, selectionExclusionReason, selectionExclusionReasons, type SelectionFacts,
} from "@/services/data-center/version-selection";

const at = (iso: string) => new Date(iso);
const facts = (versionId: string, over: Partial<SelectionFacts> = {}): SelectionFacts => ({
  versionId, sourcePublishedAt: at("2026-02-01T00:00:00.000Z"), publishedAt: at("2026-03-01T00:00:00.000Z"), effectiveFrom: null, effectiveTo: null, expiresAt: null, ...over,
});
const NOW = at("2026-10-20T12:00:00.000Z");
const ids = (candidates: readonly SelectionFacts[]) => candidates.map((candidate) => candidate.versionId);

describe("dc-version-selection-v1: which versions are in force as of an instant", () => {
  it("names the policy", () => {
    expect(DC_VERSION_SELECTION_POLICY).toBe("dc-version-selection-v1");
  });

  it("keeps a version published, effective and unexpired at the instant", () => {
    expect(selectionExclusionReason(facts("a"), NOW, true)).toBeNull();
    expect(selectionExclusionReason(facts("a", { effectiveFrom: at("2026-03-01T00:00:00.000Z"), effectiveTo: at("2027-01-01T00:00:00.000Z"), expiresAt: at("2027-06-01T00:00:00.000Z") }), NOW, true)).toBeNull();
  });

  it.each<[string, Partial<SelectionFacts>, string]>([
    ["published after the instant", { publishedAt: at("2026-11-01T00:00:00.000Z") }, "NOT_PUBLISHED_AT_AS_OF"],
    ["a source dated after the instant", { sourcePublishedAt: at("2026-12-01T00:00:00.000Z") }, "SOURCE_DATED_AFTER_AS_OF"],
    ["not yet effective", { effectiveFrom: at("2026-11-01T00:00:00.000Z") }, "NOT_EFFECTIVE_AT_AS_OF"],
    ["an effective period that ended before the instant", { effectiveTo: at("2026-09-01T00:00:00.000Z") }, "EFFECTIVE_PERIOD_ENDED_AT_AS_OF"],
    ["expired before the instant", { expiresAt: at("2026-09-01T00:00:00.000Z") }, "EXPIRED_AT_AS_OF"],
  ])("leaves out a version with %s, and says why", (_name, change, reason) => {
    expect(selectionExclusionReason(facts("a", change), NOW, true)).toBe(reason);
  });

  it("treats the end of a period as already ended at that exact instant, and its start as already begun", () => {
    expect(selectionExclusionReason(facts("a", { effectiveTo: NOW }), NOW, true)).toBe("EFFECTIVE_PERIOD_ENDED_AT_AS_OF");
    expect(selectionExclusionReason(facts("a", { expiresAt: NOW }), NOW, true)).toBe("EXPIRED_AT_AS_OF");
    expect(selectionExclusionReason(facts("a", { effectiveFrom: NOW }), NOW, true)).toBeNull();
    expect(selectionExclusionReason(facts("a", { publishedAt: NOW }), NOW, true)).toBeNull();
    expect(selectionExclusionReason(facts("a", { sourcePublishedAt: NOW }), NOW, true)).toBeNull();
  });

  it("reports the first reason in the policy's order when there are several", () => {
    const everything = facts("a", { publishedAt: at("2026-11-01T00:00:00.000Z"), sourcePublishedAt: at("2026-12-01T00:00:00.000Z"), effectiveFrom: at("2026-11-01T00:00:00.000Z"), effectiveTo: at("2026-01-01T00:00:00.000Z"), expiresAt: at("2026-01-01T00:00:00.000Z") });
    expect(selectionExclusionReason(everything, NOW, true)).toBe("NOT_PUBLISHED_AT_AS_OF");
    expect(selectionExclusionReasons).toEqual(["PUBLICATION_DATE_UNKNOWN", "NOT_PUBLISHED_AT_AS_OF", "SOURCE_DATED_AFTER_AS_OF", "NOT_EFFECTIVE_AT_AS_OF", "EFFECTIVE_PERIOD_ENDED_AT_AS_OF", "EXPIRED_AT_AS_OF"]);
  });

  it("needs a known publication date when the instant is explicit, and does not assume one", () => {
    expect(selectionExclusionReason(facts("a", { publishedAt: null }), NOW, true)).toBe("PUBLICATION_DATE_UNKNOWN");
    expect(selectionExclusionReason(facts("a", { publishedAt: null }), NOW, false)).toBeNull();
  });
});

describe("dc-version-selection-v1: which version is preferred", () => {
  it("prefers the later source date, then the later publication date, then the smaller id", () => {
    const newerSource = facts("z", { sourcePublishedAt: at("2026-05-01T00:00:00.000Z"), publishedAt: at("2026-03-01T00:00:00.000Z") });
    const newerPublication = facts("y", { sourcePublishedAt: at("2026-02-01T00:00:00.000Z"), publishedAt: at("2026-09-01T00:00:00.000Z") });
    const sameDates1 = facts("m");
    const sameDates2 = facts("b");
    expect(ids(rankVersions([sameDates1, newerPublication, sameDates2, newerSource], NOW, true).ranked)).toEqual(["z", "y", "b", "m"]);
  });

  it("ranks an unknown date after every known one, at each step", () => {
    const dated = facts("z");
    const undatedSource = facts("a", { sourcePublishedAt: null });
    expect(ids(rankVersions([undatedSource, dated], NOW, true).ranked)).toEqual(["z", "a"]);
    const unpublished = facts("a", { publishedAt: null });
    expect(ids(rankVersions([unpublished, dated], NOW, false).ranked)).toEqual(["z", "a"]);
    expect(ids(rankVersions([facts("b", { sourcePublishedAt: null, publishedAt: null }), facts("a", { sourcePublishedAt: null, publishedAt: null })], NOW, false).ranked)).toEqual(["a", "b"]);
  });

  it("breaks an exact tie by the smaller version id, compared by code point and not by locale", () => {
    const tied = [facts("b"), facts("B"), facts("a"), facts("A"), facts("a1")];
    expect(ids(rankVersions(tied, NOW, true).ranked)).toEqual(["A", "B", "a", "a1", "b"]);
  });

  it("gives the same order whatever order the candidates arrive in", () => {
    const candidates = [facts("c"), facts("a", { sourcePublishedAt: at("2026-06-01T00:00:00.000Z") }), facts("b", { publishedAt: at("2026-08-01T00:00:00.000Z") }), facts("d", { sourcePublishedAt: null })];
    const expected = ids(rankVersions(candidates, NOW, true).ranked);
    expect(expected).toEqual(["a", "b", "c", "d"]);
    for (let shift = 0; shift < candidates.length; shift += 1) {
      const rotated = [...candidates.slice(shift), ...candidates.slice(0, shift)];
      expect(ids(rankVersions(rotated, NOW, true).ranked)).toEqual(expected);
      expect(ids(rankVersions([...rotated].reverse(), NOW, true).ranked)).toEqual(expected);
    }
  });

  it("is a total order: two different versions are never equal", () => {
    expect(compareByPolicy(facts("a"), facts("b"))).toBeLessThan(0);
    expect(compareByPolicy(facts("b"), facts("a"))).toBeGreaterThan(0);
    expect(compareByPolicy(facts("a"), facts("a"))).toBe(0);
  });
});

describe("dc-version-selection-v1: ranking as of an instant", () => {
  const january = facts("jan", { publishedAt: at("2026-01-15T00:00:00.000Z"), sourcePublishedAt: at("2026-01-01T00:00:00.000Z") });
  const march = facts("mar", { publishedAt: at("2026-03-15T00:00:00.000Z"), sourcePublishedAt: at("2026-03-01T00:00:00.000Z") });
  const candidates = [march, january];

  it("never picks the latest version when an earlier instant is given: a version published later is not in force then", () => {
    const february = rankVersions(candidates, at("2026-02-10T00:00:00.000Z"), true);
    expect(ids(february.ranked)).toEqual(["jan"]);
    expect(february.excluded.map((entry) => [entry.candidate.versionId, entry.reason])).toEqual([["mar", "NOT_PUBLISHED_AT_AS_OF"]]);
    expect(ids(rankVersions(candidates, at("2026-04-01T00:00:00.000Z"), true).ranked)).toEqual(["mar", "jan"]);
    expect(rankVersions(candidates, at("2025-12-31T00:00:00.000Z"), true).ranked).toEqual([]);
  });

  it("gives the same answer for the same request, instant and versions, and lists the excluded by id", () => {
    const first = rankVersions([march, january, facts("aaa", { expiresAt: at("2026-01-01T00:00:00.000Z") }), facts("zzz", { effectiveFrom: at("2027-01-01T00:00:00.000Z") })], NOW, true);
    const second = rankVersions([facts("zzz", { effectiveFrom: at("2027-01-01T00:00:00.000Z") }), january, facts("aaa", { expiresAt: at("2026-01-01T00:00:00.000Z") }), march], NOW, true);
    expect(first).toEqual(second);
    expect(first.excluded.map((entry) => entry.candidate.versionId)).toEqual(["aaa", "zzz"]);
  });

  it("does not change the candidates it is given", () => {
    const input = [march, january];
    rankVersions(input, NOW, true);
    expect(ids(input)).toEqual(["mar", "jan"]);
  });
});
