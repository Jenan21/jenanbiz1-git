import { NextRequest, NextResponse } from "next/server";
import { detectCountryFromHeaders } from "@/lib/auth/country";

export async function GET(request: NextRequest) {
  const detectedCountry = detectCountryFromHeaders(request.headers);
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
