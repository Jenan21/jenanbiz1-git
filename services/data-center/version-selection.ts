import { byCodePoint } from "./contracts";

/**
 * How a version is chosen among the published Data Center versions that match a request by type: one policy, written down, pure and
 * identical for every caller. The same request, the same `asOf` and the same available versions always give the same version.
 *
 * `dc-version-selection-v1`
 *  1. With an explicit `asOf`, a version is IN FORCE as of that instant when it had been published by then, its source is not dated
 *     after it, it had become effective, and neither its effective period nor its expiry had ended. A version whose publication date
 *     is unknown cannot be shown to have been published by then, so it is left out rather than assumed. Without an `asOf` nothing is
 *     compared with a clock: the versions are judged as the Data Center serves them now, by its own access policy, so the skew between
 *     two clocks can never make a version that is published at this moment look unpublished.
 *  2. Among the versions in force the PREFERRED one is, in this order: the later source date (a version without one ranks after
 *     any that has one), then the later publication date (unknown ranks last), then the smaller version id compared by code point.
 *     The last step is an arbitrary but fixed tie-break, so a tie never depends on the order the database returns rows in.
 *
 * `asOf` only narrows what the Data Center serves today: it never makes visible a version the Data Center's access policy hides now.
 */
export const DC_VERSION_SELECTION_POLICY = "dc-version-selection-v1";

export interface SelectionFacts {
  versionId: string;
  sourcePublishedAt: Date | null;
  /** When the version was published, from the Data Center's lifecycle record; null when none is recorded. */
  publishedAt: Date | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  expiresAt: Date | null;
}

export const selectionExclusionReasons = [
  "PUBLICATION_DATE_UNKNOWN", "NOT_PUBLISHED_AT_AS_OF", "SOURCE_DATED_AFTER_AS_OF", "NOT_EFFECTIVE_AT_AS_OF", "EFFECTIVE_PERIOD_ENDED_AT_AS_OF", "EXPIRED_AT_AS_OF",
] as const;
export type SelectionExclusionReason = typeof selectionExclusionReasons[number];

/** Later first; an unknown date after every known one. */
const laterFirst = (first: Date | null, second: Date | null) => {
  if (first === null || second === null) return first === second ? 0 : first === null ? 1 : -1;
  return second.getTime() - first.getTime();
};

/** Why a version is not in force as of the instant, or null when it is. The first reason in the policy's order is reported. Without an explicit instant nothing is excluded. */
export function selectionExclusionReason(facts: SelectionFacts, asOf: Date, asOfIsExplicit: boolean): SelectionExclusionReason | null {
  if (!asOfIsExplicit) return null;
  if (facts.publishedAt === null) return "PUBLICATION_DATE_UNKNOWN";
  if (facts.publishedAt.getTime() > asOf.getTime()) return "NOT_PUBLISHED_AT_AS_OF";
  if (facts.sourcePublishedAt !== null && facts.sourcePublishedAt.getTime() > asOf.getTime()) return "SOURCE_DATED_AFTER_AS_OF";
  if (facts.effectiveFrom !== null && facts.effectiveFrom.getTime() > asOf.getTime()) return "NOT_EFFECTIVE_AT_AS_OF";
  if (facts.effectiveTo !== null && facts.effectiveTo.getTime() <= asOf.getTime()) return "EFFECTIVE_PERIOD_ENDED_AT_AS_OF";
  if (facts.expiresAt !== null && facts.expiresAt.getTime() <= asOf.getTime()) return "EXPIRED_AT_AS_OF";
  return null;
}

/** The policy's order: negative when `first` is preferred. Total, because the version id is unique. */
export function compareByPolicy(first: SelectionFacts, second: SelectionFacts): number {
  return laterFirst(first.sourcePublishedAt, second.sourcePublishedAt) || laterFirst(first.publishedAt, second.publishedAt) || byCodePoint(first.versionId, second.versionId);
}

export interface RankedSelection<T extends SelectionFacts> {
  /** The versions in force, the preferred one first. */
  ranked: T[];
  /** The versions that are not in force as of the instant, by version id, each with the reason. */
  excluded: Array<{ candidate: T; reason: SelectionExclusionReason }>;
}

export function rankVersions<T extends SelectionFacts>(candidates: readonly T[], asOf: Date, asOfIsExplicit: boolean): RankedSelection<T> {
  const ranked: T[] = [];
  const excluded: Array<{ candidate: T; reason: SelectionExclusionReason }> = [];
  for (const candidate of candidates) {
    const reason = selectionExclusionReason(candidate, asOf, asOfIsExplicit);
    if (reason === null) ranked.push(candidate);
    else excluded.push({ candidate, reason });
  }
  ranked.sort(compareByPolicy);
  excluded.sort((first, second) => byCodePoint(first.candidate.versionId, second.candidate.versionId));
  return { ranked, excluded };
}
