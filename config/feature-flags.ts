export const featureFlags = {
  nativeFirstEnforced: true,
  sharedEnginesEnforced: true,
  externalDataOnlyWhenNecessary: true,
  replaceableProvidersRequired: true,
  academyWorkforceEnabled: true,
  liveAiAcceptanceDeferred: true,
} as const;

export type FeatureFlags = typeof featureFlags;
