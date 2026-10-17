export const releaseTransitions = {
  DRAFT: ["PROCESSING"],
  PROCESSING: ["READY_FOR_REVIEW", "FAILED"],
  READY_FOR_REVIEW: ["PROCESSING", "APPROVED"],
  APPROVED: ["PUBLISHED", "DRAFT"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: ["PUBLISHED"],
  FAILED: ["DRAFT", "PROCESSING"],
} as const;

export type MapReleaseStatus = keyof typeof releaseTransitions;

export function canTransitionRelease(from: MapReleaseStatus, to: MapReleaseStatus) {
  return (releaseTransitions[from] as readonly MapReleaseStatus[]).includes(to);
}

export function licenseAllowsPublication(dataset: {
  internalUseAllowed: boolean | null;
  licenseReviewedAt: Date | string | null;
}) {
  return dataset.internalUseAllowed === true && dataset.licenseReviewedAt !== null;
}

export function isSafeMapLayerKey(value: string) {
  return /^[a-z][a-z0-9_-]{1,63}$/.test(value);
}

export function isSafeMapVersion(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value);
}
