import { NextRequest, NextResponse } from "next/server";
import countries from "world-countries";

const countryCodes = new Set(
  countries.map((country) => country.cca2.toUpperCase()),
);

function validCountryCode(value: string | null) {
  const countryCode = value?.trim().toUpperCase();
  return countryCode && countryCodes.has(countryCode) ? countryCode : null;
}

export async function GET(request: NextRequest) {
  const detectedCountry = [
    request.headers.get("cf-ipcountry"),
    request.headers.get("x-vercel-ip-country"),
    request.headers.get("x-country-code"),
  ]
    .map(validCountryCode)
    .find(Boolean);
  const locale = request.cookies.get("locale")?.value;
  const fallbackCountry = locale === "ar" ? "SA" : "US";

  return NextResponse.json(
    {
      countryCode: detectedCountry ?? fallbackCountry,
      source: detectedCountry ? "network" : "default",
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}