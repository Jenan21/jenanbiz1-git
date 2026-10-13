import countries from "world-countries";

const countryCodes = new Set(countries.map((country) => country.cca2.toUpperCase()));

export function validCountryCode(value: string | null | undefined) {
  const countryCode = value?.trim().toUpperCase();
  return countryCode && countryCodes.has(countryCode) ? countryCode : null;
}

/** The visitor's country as reported by the hosting network edge, when it reports one. */
export function detectCountryFromHeaders(headers: Pick<Headers, "get">) {
  return (
    [
      headers.get("cf-ipcountry"),
      headers.get("x-vercel-ip-country"),
      headers.get("x-country-code"),
    ]
      .map(validCountryCode)
      .find(Boolean) ?? null
  );
}
