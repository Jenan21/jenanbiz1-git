import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { checkProjectRateLimit } from "@/lib/rate-limit/project-rate-limit";
import { getProjectIntelligenceProvider } from "@/services/projects/project-intelligence-provider";

type Address = {
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  suburb?: string;
  neighbourhood?: string;
  city_district?: string;
  quarter?: string;
};
type Place = { lat: string; lon: string; display_name?: string; address?: Address };

function describe(place: Place) {
  const address = place.address ?? {};
  const city = address.city ?? address.town ?? address.village ?? address.state ?? "";
  const district = address.suburb ?? address.neighbourhood ?? address.quarter ?? address.city_district ?? "";
  const label = [city, district].filter(Boolean).join(" - ") || place.display_name?.split(",").slice(0, 2).join(" -") || "";
  return {
    label,
    city,
    district,
    latitude: Number(place.lat),
    longitude: Number(place.lon),
  };
}

/** Place search and reverse lookup for the location picker; the browser never talks to the geocoder directly. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const decision = await checkProjectRateLimit("geocode", request, user.id);
  if (!decision.allowed) {
    return NextResponse.json({ success: false, message: "Rate limit exceeded" }, { status: 429, headers: { "retry-after": String(decision.retryAfterSeconds) } });
  }

  const query = request.nextUrl.searchParams;
  const provider = getProjectIntelligenceProvider();
  const text = query.get("q")?.trim().slice(0, 120);
  const latitude = Number(query.get("lat"));
  const longitude = Number(query.get("lon"));

  try {
    if (text && text.length >= 2) {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&countrycodes=sa&accept-language=ar&q=${encodeURIComponent(text)}`;
      const places = await provider.getJson<Place[]>(url);
      const results = places.map(describe).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && item.label);
      return NextResponse.json({ success: true, results }, { headers: { "cache-control": "private, no-store" } });
    }
    if (query.has("lat") && query.has("lon") && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=16&accept-language=ar&lat=${latitude}&lon=${longitude}`;
      const place = await provider.getJson<Place | { error: string }>(url);
      const result = "error" in place ? undefined : describe(place);
      return NextResponse.json({ success: true, results: result?.label ? [result] : [] }, { headers: { "cache-control": "private, no-store" } });
    }
  } catch {
    return NextResponse.json({ success: false, message: "The place lookup is unavailable right now" }, { status: 502 });
  }
  return NextResponse.json({ success: false, message: "A search text or coordinates are required" }, { status: 400 });
}
