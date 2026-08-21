export const countryRules = {
  SA: { locale: "ar", currency: "SAR", timezone: "Asia/Riyadh" },
  US: { locale: "en", currency: "USD", timezone: "America/New_York" },
} as const;

export type CountryCode = keyof typeof countryRules;
