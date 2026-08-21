export const featureFlags = {
  nativeFirstEnforced: true,
  sharedEnginesEnforced: true,
  externalDataOnlyWhenNecessary: true,
  replaceableProvidersRequired: true,
} as const;

export type FeatureFlags = typeof featureFlags;
